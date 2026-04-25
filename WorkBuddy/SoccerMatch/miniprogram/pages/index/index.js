// pages/index/index.js
const app = getApp()
const db = wx.cloud.database()
import { formatDate, requestWithRetry } from '../../utils/format.js'
import { getPositionLabelShort, REGISTRATION_STATUS_MAP } from '../../utils/constants.js'

Page({
  data: {
    activities: [],
    announcements: [],
    activeFilter: 'all',
    isAdmin: false,
    loading: true,
    activityWatcher: null,
    lastShowTime: 0,
    // 注册弹窗
    showRegisterModal: false
  },

  onLoad() {
    this.setData({ isAdmin: app.globalData.isAdmin })
  },

  onShow() {
    const now = Date.now()

    // 检测全局标记：TabBar 发布按钮触发的注册检查
    if (app.globalData._needRegisterForPublish) {
      app.globalData._needRegisterForPublish = false
      if (!app.isUserRegistered()) {
        this.setData({ showRegisterModal: true })
        return
      }
      // 已注册，直接跳转发布页
      wx.navigateTo({ url: '/pages/activity/create' })
      return
    }

    // 确保 openid 已就绪（解决编译后首次加载 openid 为空导致球队活动全被过滤的问题）
    this._waitForOpenid().then(() => {
      // 智能刷新：超过 30 秒才重新加载公告（公告变化较少）
      if (now - this.data.lastShowTime > 30000) {
        this.loadAnnouncements()
      }

      // 先渲染后刷新策略（stale-while-revalidate）
      if (this.data.activities.length > 0 && now - this.data.lastShowTime <= 30000) {
        // 30秒内返回，后台静默刷新用户信息
        this.silentRefreshUsers()
      } else if (this.data.activities.length > 0) {
        // 有数据但超过30秒，先展示后刷新
        this.loadActivities(true, false)
      } else {
        // 首次加载：先尝试本地缓存快速渲染
        const hasCache = this.loadActivitiesFromCache()
        this.loadActivities(true, false, !hasCache)
      }

      // 刷新管理员状态
      this.setData({ isAdmin: app.globalData.isAdmin })
      // 记录页面显示时间
      this.setData({ lastShowTime: now })

      // 同步 TabBar 选中状态
      if (typeof this.getTabBar === 'function' && this.getTabBar()) {
        this.getTabBar().setData({ selected: 0 })
      }
    })
  },

  // 等待 openid 就绪（最多等3秒，超时用当前值继续）
  _waitForOpenid() {
    return new Promise(resolve => {
      const tryGet = () => {
        const oid = app.globalData.openid || wx.getStorageSync('openid')
        if (oid) { resolve(); return }
        // 还没就绪，50ms后再试（最多60次=3秒）
        if ((this._oidRetryCount || 0) < 60) {
          this._oidRetryCount = (this._oidRetryCount || 0) + 1
          setTimeout(tryGet, 50)
        } else {
          resolve() // 超时，继续执行（可能是离线模式）
        }
      }
      tryGet()
    })
  },

  // 注册完成回调
  onRegistered() {
    this.setData({ showRegisterModal: false })
    // 注册成功后加载数据
    this.loadAnnouncements()
    this.loadActivities(true, true)
    // 如果是从发布按钮触发的注册，注册成功后跳转发布页
    if (app.globalData._needRegisterForPublish) {
      app.globalData._needRegisterForPublish = false
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/activity/create' })
      }, 300)
    }
  },

  // 关闭注册弹窗（用户选择暂不注册）
  onCloseRegister() {
    this.setData({ showRegisterModal: false })
    // 清理可能残留的发布注册标记
    app.globalData._needRegisterForPublish = false
  },

  // 后台静默刷新用户信息（不显示 loading，不影响页面交互）
  // 注意：forceRefresh=true 确保新注册用户的信息能及时加载到缓存
  async silentRefreshUsers() {
    try {
      const allUserIds = new Set()
      this.data.activities.forEach(act => {
        if (act.createdBy) allUserIds.add(act.createdBy)
        const regs = act.registrations || []
        regs.forEach(r => {
          if (r.openid) allUserIds.add(r.openid)
        })
      })

      if (allUserIds.size > 0) {
        // 只刷新缓存，不重新格式化（首页不再显示用户信息）
        await app.fetchUsersWithCache(Array.from(allUserIds), true)
      }
    } catch (e) {
      // 静默刷新失败不影响用户，忽略
    }
  },

  onUnload() {
    // 页面卸载时关闭监听
    if (this.data.activityWatcher) {
      this.data.activityWatcher.close()
      this.setData({ activityWatcher: null })
    }
  },

  // 从本地缓存快速渲染活动列表（冷启动秒开）
  // 注意：只更新数据，不控制 loading 状态，让骨架屏保持到网络数据回来
  loadActivitiesFromCache() {
    try {
      const cached = wx.getStorageSync('activities_cache')
      if (cached && cached.data && cached.data.length > 0) {
        // 检查缓存是否过期（10分钟过期）
        const CACHE_EXPIRE_MS = 10 * 60 * 1000
        if (cached.timestamp && Date.now() - cached.timestamp > CACHE_EXPIRE_MS) {
          // 缓存过期，返回 false 让骨架屏显示，同时发起网络请求
          return false
        }
        // 有缓存且未过期：骨架屏立即消失，替换为缓存数据
        this.setData({ activities: cached.data, loading: false })
        return true
      }
      // 无缓存时：保持 loading=true，骨架屏继续显示，直到网络数据回来
      return false
    } catch (e) {
      return false
    }
  },

  // 保存活动列表到本地缓存
  saveActivitiesCache(activities) {
    try {
      wx.setStorageSync('activities_cache', {
        data: activities,
        timestamp: Date.now()
      })
    } catch (e) {
      // 缓存写入失败，忽略
    }
  },

  // 加载公告
  async loadAnnouncements() {
    try {
      const res = await db.collection('announcements')
        .where({ active: true })
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get()
      this.setData({ announcements: res.data })
    } catch (e) {
      console.error('加载公告失败', e)
    }
  },

  // 带重试机制的通用请求方法
  async requestWithRetry(requestFn, maxRetries = 3, delay = 1000) {
    let lastError
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await requestFn()
      } catch (e) {
        lastError = e
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * (i + 1)))
        }
      }
    }
    throw lastError
  },

    // 加载活动列表 - 智能刷新策略
  // @param {boolean} enableWatch - 是否启用数据库监听（默认 false）
  // @param {boolean} forceRefreshUsers - 是否强制刷新用户缓存（默认 false）
  // @param {boolean} showLoading - 是否显示骨架屏/loading（默认 false，有缓存时为 false）
  async loadActivities(enableWatch = false, forceRefreshUsers = false, showLoading = false) {
    // 如果已有内存缓存数据，不显示 loading（已由 loadActivitiesFromCache 秒渲染）
    const hasMemoryCache = this.data.activities.length > 0
    if (!hasMemoryCache && showLoading) {
      this.setData({ loading: true })
    }
    try {
      const openid = app.globalData.openid || wx.getStorageSync('openid')
      const filter = this.data.activeFilter
      const now = new Date()

      // 获取全部活动（按创建时间倒序）
      // 注意：不使用 activityDate 排序（Date 类型在云数据库中需要索引）
      // 状态判断由前端 formatActivity 根据时间动态计算
      let query = db.collection('activities').orderBy('createdAt', 'desc')

      // 根据筛选条件过滤（只根据数据库 status，不结合日期）
      // 日期判断由前端 formatActivity 完成
      if (filter === 'upcoming') {
        // 未开始：只看状态 open
        query = db.collection('activities')
          .where({ status: 'open' })
          .orderBy('createdAt', 'desc')
      } else if (filter === 'ongoing') {
        // 进行中：状态为 ongoing
        query = db.collection('activities')
          .where({ status: 'ongoing' })
          .orderBy('createdAt', 'desc')
      } else if (filter === 'finished') {
        // 已结束：状态为 finished 或 cancelled
        query = db.collection('activities')
          .where({
            status: db.command.in(['finished', 'cancelled'])
          })
          .orderBy('createdAt', 'desc')
      }

      const res = await this.requestWithRetry(() => query.limit(50).get())
      let activities = res.data
      console.log('[index] 查询到活动数量:', activities.length, '筛选条件:', filter)

      // ========== 球队权限判断 ==========
      // 收集所有活动的 teamId
      const teamIds = new Set()
      let publicActivities = 0
      activities.forEach(act => {
        if (act.teamId) {
          teamIds.add(act.teamId)
        } else {
          publicActivities++
        }
      })
      console.log('[index] 活动统计: 公开=', publicActivities, '球队=', teamIds.size, 'openid=', openid)

      // 并行查询球队成员和散客记录
      const visibleTeamIdsPromise = openid && teamIds.size > 0
        ? Promise.all([
            db.collection('team_members')
              .where({ openid: openid, teamId: db.command.in(Array.from(teamIds)) })
              .get(),
            db.collection('team_casuals')
              .where({ openid: openid, teamId: db.command.in(Array.from(teamIds)) })
              .get()
          ]).then(([membersRes, casualsRes]) => {
            const myTeamIds = new Set(membersRes.data.map(m => m.teamId))
            const casualTeamIds = new Set(casualsRes.data.map(c => c.teamId))
            return new Set([...myTeamIds, ...casualTeamIds])
          }).catch(e => {
            console.error('[index] 球队权限查询失败', e)
            return new Set()
          })
        : Promise.resolve(new Set())

      // 收集所有需要查询的用户ID（提前执行，不等待权限查询）
      const allUserIds = new Set()
      activities.forEach(act => {
        const regs = act.registrations || []
        regs.forEach(r => {
          if (r.openid) allUserIds.add(r.openid)
        })
      })

      // 批量获取最新用户信息（带缓存）
      let latestUsers = {}
      if (allUserIds.size > 0) {
        try {
          latestUsers = await app.fetchUsersWithCache(Array.from(allUserIds), forceRefreshUsers || false)
        } catch (e) {}
      }

      // 等待权限查询完成
      const visibleTeamIds = await visibleTeamIdsPromise
      console.log('[index] 最终可见球队:', Array.from(visibleTeamIds))
      // 缓存 visibleTeamIds 供 watcher 使用
      this._cachedVisibleTeamIds = visibleTeamIds
      // ========== 球队权限判断结束 ==========

      console.log('[index] 开始格式化, activities:', activities.length)
      const formattedActivities = await Promise.all(activities.map(act => {
        try {
          // 传入 visibleTeamIds 用于判断用户是否有权限查看该活动
          const result = this.formatActivity(act, openid, latestUsers, visibleTeamIds)
          return result
        } catch (e) {
          console.error('[index] formatActivity 异常:', e, 'act:', act)
          return null
        }
      }))
      // 过滤掉 null（无权限查看的球队活动返回 null）并根据筛选条件一次遍历
      const filteredActivities = formattedActivities.filter(item => {
        if (!item) return false
        // 根据筛选条件过滤
        switch (filter) {
          case 'upcoming':
            return item.effectiveStatus === 'open'
          case 'ongoing':
            return item.effectiveStatus === 'ongoing'
          case 'finished':
            return item.effectiveStatus === 'finished' || item.effectiveStatus === 'cancelled'
          default:
            return true
        }
      })
      console.log('[index] 筛选后数据:', filteredActivities.length, 'filter:', filter)

      // 更新活动列表（查询成功就更新，不管是否为空）
      this.setData({ activities: filteredActivities, loading: false }, () => {
        console.log('[index] setData 完成, activities.length:', this.data.activities.length)
      })

      // 缓存活动列表到本地（只缓存用户有权限看到的活动）
      this.saveActivitiesCache(filteredActivities)

      // 启用数据库监听（传入 visibleTeamIds 用于实时更新的权限判断）
      if (!this.data.activityWatcher) {
        this.startActivityWatcher(openid, latestUsers, visibleTeamIds)
      }
    } catch (e) {
      console.error('加载活动失败', e)
      // 出错时保留已有数据，只关闭 loading
      this.setData({ loading: false })
      // 只有在没有任何数据时才提示
      if (this.data.activities.length === 0) {
        wx.showToast({ title: '网络异常，请稍后重试', icon: 'none', duration: 2000 })
      }
    }
  },

  // 启动数据库监听（实时更新）
  startActivityWatcher(openid, latestUsers = {}, visibleTeamIds = new Set()) {
    // 先关闭旧监听
    if (this.data.activityWatcher) {
      this.data.activityWatcher.close()
    }

    // 标记：是否是首次触发（首次触发用于同步旧数据，应该忽略）
    let isFirstTrigger = true
    // 记录首次触发时的数据版本（用于后续增量更新）
    let lastKnownDocs = []

    // 只监听最近 7 天创建的活动（减少监听范围）
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const watcher = db.collection('activities')
      .where({
        createdAt: db.command.gte(sevenDaysAgo)
      })
      .watch({
        onChange: async (snapshot) => {
          console.log('[index] watcher onChange 触发, docs数量:', snapshot.docs?.length, 'isFirst:', isFirstTrigger)

          // ========== 首次触发忽略：loadActivities 已经加载了正确数据 ==========
          if (isFirstTrigger) {
            console.log('[index] watcher 首次触发，忽略（等待后续增量更新）')
            isFirstTrigger = false
            return
          }
          // ========== 首次触发处理结束 ==========

          // 获取增量变更（新版本 snapshot.docChanges 是数组，旧版本是方法）
          const changes = typeof snapshot.docChanges === 'function' 
            ? snapshot.docChanges() 
            : snapshot.docChanges || []
          console.log('[index] watcher docChanges:', changes?.length, changes)
          if (!changes || changes.length === 0) return

          // 从当前页面的 activities 中获取 openid（避免闭包 stale 问题）
          const currentOpenid = app.globalData.openid || wx.getStorageSync('openid')

          // 使用缓存的 visibleTeamIds，简化 watcher 逻辑
          // 权限只在首次加载时查询，实时更新复用缓存
          const currentVisibleTeamIds = this._cachedVisibleTeamIds || new Set()

          // 格式化变更的活动
          const formatChange = async (change) => {
            const act = change.doc
            if (!act) return null
            
            // type: 'update' | 'remove' | 'init'
            if (change.type === 'remove') {
              return { _id: change.docId, _deleted: true }
            }
            
            const formatted = await this.formatActivity(act, currentOpenid, {}, currentVisibleTeamIds)
            return formatted
          }

          const formattedChanges = await Promise.all(changes.map(formatChange))

          // 构建新的 activities 数组
          let newActivities = [...this.data.activities]
          
          formattedChanges.forEach((item, index) => {
            const change = changes[index]
            if (!item) return
            
            if (item._deleted) {
              // 删除：移除对应活动
              newActivities = newActivities.filter(a => a._id !== change.docId)
            } else if (item !== null) {
              // 更新或新增：查找并替换或添加
              const existIndex = newActivities.findIndex(a => a._id === change.docId)
              if (existIndex >= 0) {
                newActivities[existIndex] = item
              } else {
                newActivities.unshift(item)
              }
            }
          })

          // 过滤无权限查看的活动（防止之前有权限但现在没了）
          newActivities = newActivities.filter(a => {
            if (a._deleted) return false
            // 球队活动权限检查
            if (a.teamId && !currentVisibleTeamIds.has(a.teamId)) {
              return false
            }
            return true
          })

          console.log('[index] watcher 更新, 新数组长度:', newActivities.length)

          this.setData({
            activities: newActivities
          }, () => {
            this.silentRefreshUsers()
          })
          this.saveActivitiesCache(newActivities)
        },
        onError: (err) => {
          console.error('数据库监听失败', err)
          // 监听失败后，回退到定时刷新
          setTimeout(() => {
            this.loadActivities(true)
          }, 5000)
        }
      })

    this.setData({ activityWatcher: watcher })
  },

  // 格式化活动数据
  // @param act - 活动数据
  // @param openid - 当前用户openid
  // @param latestUsers - 用户信息缓存
  // @param visibleTeamIds - 用户有权查看的teamId集合
  async formatActivity(act, openid, latestUsers = {}, visibleTeamIds = new Set()) {
    // ========== 球队活动权限判断 ==========
    // 权限规则：
    // 1. 无 teamId = 公开活动，所有人可见
    // 2. 有 teamId = 球队活动，只有球队成员/散客可见
    // 3. 例外：活动创建者可查看自己创建的活动（即使还没被加入球队）
    const isCreator = act.createdBy === openid
    if (act.teamId) {
      const hasAccess = visibleTeamIds.has(act.teamId) || isCreator
      if (!hasAccess) {
        console.log('[index] formatActivity 过滤球队活动:', act.teamId, act.title, '可见列表:', Array.from(visibleTeamIds), '创建者:', isCreator)
        return null
      }
    }
    // ========== 权限判断结束 ==========

    const registrations = act.registrations || []
    const confirmed = registrations.filter(r => r.status === 'confirmed')
    const pending = registrations.filter(r => r.status === 'pending')
    const leave = registrations.filter(r => r.status === 'leave')
    const myReg = registrations.find(r => r.openid === openid)

    // 活动日期格式化
    const actDate = act.activityDate instanceof Date ? act.activityDate : new Date(act.activityDate)
    const displayDate = this.formatDate(actDate)
    const now = new Date()

    // 状态判断：基于日期动态计算（与详情页一致）
    // 规则：已取消 > 已结束（时间到/截止） > 进行中 > 报名中
    let statusText, statusClass, effectiveStatus, canEdit, canCancel, canDelete
    let isDeadlinePassed = false
    
    // 检查截止时间
    if (act.deadline) {
      const deadline = act.deadline instanceof Date ? act.deadline : new Date(act.deadline)
      if (now >= deadline) {
        isDeadlinePassed = true
      }
    }
    
    // 状态判断顺序：已取消 > 已结束 > 进行中 > 报名中
    if (act.status === 'cancelled') {
      statusText = '已取消'; statusClass = 'tag-red'; effectiveStatus = 'cancelled'
      canEdit = false; canCancel = false; canDelete = isCreator
    } else if (act.status === 'finished' || actDate < now || isDeadlinePassed) {
      // 数据库状态为finished，或活动日期已过，或截止时间已到 → 已结束
      statusText = '已结束'; statusClass = 'tag-gray'; effectiveStatus = 'finished'
      canEdit = false; canCancel = false; canDelete = isCreator
    } else if (act.status === 'ongoing') {
      statusText = '进行中'; statusClass = 'tag-blue'; effectiveStatus = 'ongoing'
      canEdit = false; canCancel = false; canDelete = false
    } else {
      // open 状态且时间未到 → 报名中
      statusText = '报名中'; statusClass = 'tag-green'; effectiveStatus = 'open'
      canEdit = isCreator; canCancel = isCreator; canDelete = false
    }

    // 我的状态
    let myStatus = null, myStatusText = '', myStatusClass = ''
    if (myReg) {
      myStatus = myReg.status
      const statusMap = {
        confirmed: { text: '✅ 已报名', cls: 'tag-green' },
        pending: { text: '⏳ 待定', cls: 'tag-yellow' },
        leave: { text: '🙅 请假', cls: 'tag-red' }
      }
      myStatusText = statusMap[myReg.status]?.text || ''
      myStatusClass = statusMap[myReg.status]?.cls || ''
    }

    // 位置代码映射表 - 统一使用"中文名称 + 英文代码"格式
    const posMap = {
      'ALL': '全能 ALL',
      'GK': '守门员 GK', 'LB': '左后卫 LB', 'CB': '中后卫 CB', 'RB': '右后卫 RB',
      'LWB': '左翼卫 LWB', 'RWB': '右翼卫 RWB',
      'CDM': '后腰 CDM', 'CM': '中场 CM', 'LM': '左中场 LM', 'RM': '右中场 RM',
      'CAM': '前腰 CAM', 'LW': '左边锋 LW', 'RW': '右边锋 RW',
      'ST': '中锋 ST', 'CF': '前锋 CF'
    }
    
    // 处理位置信息：获取首选位置（order=1）的中文名称
    const getFirstPosition = (position) => {
      if (!position) return ''
      
      let firstPosCode = ''
      if (typeof position === 'string') {
        // 旧格式：逗号分隔的字符串
        const positions = position.split(/[,，\/\s]+/).filter(p => p.trim())
        firstPosCode = positions[0]
      } else if (Array.isArray(position)) {
        // 新格式：数组，查找order=1
        const firstPosItem = position.find(p => 
          typeof p === 'object' ? p.order === 1 : position.indexOf(p) === 0
        )
        firstPosCode = typeof firstPosItem === 'object' 
          ? firstPosItem.value 
          : firstPosItem
      }
      
      if (!firstPosCode) return ''
      
      const chinesePosition = posMap[firstPosCode.trim().toUpperCase()] || firstPosCode.trim()
      return chinesePosition.substring(0, 2) // 只显示前2个字
    }
    
    // 显示前6人头像（首页卡片空间有限）- 使用最新用户信息
    // base64 直接用，不走云存储权限
    const playerSlice = confirmed.slice(0, 6)
    const confirmedPlayers = playerSlice.map(r => {
      const latestUser = latestUsers[r.openid]
      return {
        ...r,
        nickName: latestUser?.nickName || r.nickName,
        displayAvatar: app.getDisplayAvatar(latestUser) || app.globalData.defaultAvatar,
        shortName: (latestUser?.nickName || r.nickName) ? (latestUser?.nickName || r.nickName).slice(0, 8) : '队员',
        firstPosition: getFirstPosition(latestUser?.positions || r.position)
      }
    })

    // 确保所有字段都有默认值
    const actWithDefaults = {
      title: '',
      description: '',
      matchType: '',
      time: '',
      locationName: '',
      location: '',
      fieldType: '人工草',
      maxPlayers: 16,
      fee: 0,
      notice: '',
      allowPending: true,
      ...act
    }

    // 活动来源标记
    // 无 teamId = 公开活动，标记为"🏠 公开"
    // 有 teamId = 球队活动，标记为球队 Logo + 名称
    const isPublic = !act.teamId
    let sourceTag, sourceTagClass, teamLogo
    if (isPublic) {
      sourceTag = '🏠 公开'
      sourceTagClass = 'tag-public'
      teamLogo = ''
    } else {
      sourceTag = act.teamName || '球队'  // 只存名称，Logo 单独字段
      sourceTagClass = 'tag-team'
      teamLogo = act.teamLogo || ''  // 球队 Logo
    }

    return {
      ...actWithDefaults,
      registrations, // 重要：保留 registrations 字段，用于后续刷新用户信息
      confirmedCount: confirmed.length,
      pendingCount: pending.length,
      leaveCount: leave.length,
      confirmedPlayers,
      displayDate,
      statusText,
      statusClass,
      effectiveStatus, // 用于权限判断
      isCreator,
      canEdit,
      canCancel,
      canDelete,
      myStatus,
      myStatusText,
      myStatusClass,
      // 活动来源标记
      sourceTag,
      sourceTagClass,
      teamLogo,
      isPublic
    }
  },

  formatDate(date) {
    const m = date.getMonth() + 1
    const d = date.getDate()
    const weekdays = ['日', '一', '二', '三', '四', '五', '六']
    const w = weekdays[date.getDay()]
    return `${m}月${d}日（周${w}）`
  },

  setFilter(e) {
    const type = e.currentTarget.dataset.type
    this.setData({ activeFilter: type }, () => {
      this.loadActivities()
    })
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/activity/detail?id=${id}` })
  },

  goTeamHome(e) {
    const teamId = e.currentTarget.dataset.teamid
    wx.navigateTo({ url: `/pages/team/home?teamId=${teamId}` })
  },

  goTactics(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/tactics/tactics?activityId=${id}` })
  },

  goAdmin() {
    wx.navigateTo({ url: '/pages/admin/admin' })
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/activity/create' })
  },

  // 编辑活动
  goEdit(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/activity/create?id=${id}&mode=edit` })
  },

  // 取消活动
  async cancelActivity(e) {
    // 阻止事件冒泡，防止触发卡片点击
    e.stopPropagation && e.stopPropagation()

    const id = e.currentTarget.dataset.id
    const activity = this.data.activities.find(a => a._id === id)
    const openid = app.globalData.openid || wx.getStorageSync('openid')

    // 权限检查：只有创建者可取消
    if (!activity) {
      wx.showToast({ title: '活动不存在', icon: 'none' })
      return
    }

    if (activity.createdBy !== openid) {
      wx.showToast({ title: '只有发布者可取消活动', icon: 'none' })
      return
    }

    // 状态检查：只有报名中的活动可取消
    if (activity.status !== 'open') {
      wx.showToast({ title: '该状态无法取消', icon: 'none' })
      return
    }
    
    const res = await wx.showModal({
      title: '确认取消',
      content: '取消后其他成员将无法报名，是否确认取消该活动？',
      confirmColor: '#ff9500'
    })
    
    if (!res.confirm) return

    wx.showLoading({ title: '取消中...' })
    
    try {
      const updateRes = await db.collection('activities').doc(id).update({
        data: {
          status: 'cancelled',
          updatedAt: db.serverDate()
        }
      })
      wx.showToast({ title: '活动已取消', icon: 'success' })
      // 刷新列表
      this.loadActivities()
    } catch (e) {
      console.error('取消活动失败', e)
      wx.showToast({ title: '取消失败: ' + (e.message || '未知错误'), icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // 删除活动
  async deleteActivity(e) {
    const id = e.currentTarget.dataset.id
    const activity = this.data.activities.find(a => a._id === id)
    const openid = app.globalData.openid || wx.getStorageSync('openid')

    // 权限检查：只有创建者可删除
    if (!activity || activity.createdBy !== openid) {
      wx.showToast({ title: '无权操作', icon: 'none' })
      return
    }

    const res = await wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，是否确认删除该活动？',
      confirmColor: '#ff4444'
    })

    if (!res.confirm) return

    wx.showLoading({ title: '删除中...' })

    try {
      // 调用云函数删除
      const deleteRes = await wx.cloud.callFunction({
        name: 'deleteActivity',
        data: {
          activityId: id,
          openid: openid
        }
      })

      if (deleteRes.result.success) {
        wx.showToast({ title: '删除成功', icon: 'success' })
        // 刷新列表
        this.loadActivities()
      } else {
        wx.showToast({ title: deleteRes.result.message || '删除失败', icon: 'none' })
      }
    } catch (e) {
      console.error('删除活动失败', e)
      wx.showToast({ title: '删除失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // 显示公告详情
  showAnnounceDetail(e) {
    const index = e.currentTarget.dataset.index || 0
    const announce = this.data.announcements[index]
    if (announce) {
      wx.showModal({
        title: '公告详情',
        content: announce.content,
        showCancel: false,
        confirmText: '知道了'
      })
    }
  }
})
