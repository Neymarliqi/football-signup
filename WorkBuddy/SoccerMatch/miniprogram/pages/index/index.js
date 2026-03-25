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
    placeholderAvatar: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0',
    activityWatcher: null,
    lastShowTime: 0
  },

  onLoad() {
    this.setData({ isAdmin: app.globalData.isAdmin })
  },

  onShow() {
    const now = Date.now()

    // 智能刷新：超过 30 秒才重新加载公告（公告变化较少）
    if (now - this.data.lastShowTime > 30000) {
      this.loadAnnouncements()
    }

    // 首次加载或超过 30 秒才全量加载活动
    if (this.data.activities.length === 0 || now - this.data.lastShowTime > 30000) {
      this.loadActivities(true, true) // 第二个参数 true，强制刷新用户缓存
    } else {
      // 如果活动列表已有，仅刷新用户信息（确保看到最新头像）
      this.refreshUsersInfo()
    }

    // 刷新管理员状态
    this.setData({ isAdmin: app.globalData.isAdmin })

    // 记录页面显示时间
    this.setData({ lastShowTime: now })

    // 同步 TabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
  },

  // 强制刷新所有用户信息（onShow 时调用）
  async refreshUsersInfo() {
    try {
      console.log('[refreshUsersInfo] 开始刷新用户信息')
      // 收集所有活动的所有用户 openid
      const allUserIds = new Set()
      this.data.activities.forEach(act => {
        if (act.createdBy) allUserIds.add(act.createdBy)
        const regs = act.registrations || []
        regs.forEach(r => {
          if (r.openid) allUserIds.add(r.openid)
        })
      })

      console.log('[refreshUsersInfo] 收集到的用户IDs:', Array.from(allUserIds))

      // 强制刷新用户缓存
      if (allUserIds.size > 0) {
        const latestUsers = await app.fetchUsersWithCache(Array.from(allUserIds), true) // true = 强制刷新
        console.log('[refreshUsersInfo] 查询到的最新用户:', Object.keys(latestUsers).length, '个')
        Object.values(latestUsers).forEach(u => {
          console.log('  -', u.nickName, u.avatarUrl?.substring(0, 50))
        })

        // 重新格式化活动列表，使用最新用户信息
        const openid = app.globalData.openid || wx.getStorageSync('openid')
        const formattedActivities = this.data.activities.map(act => this.formatActivity(act, openid, latestUsers))
        this.setData({ activities: formattedActivities })
        console.log('[refreshUsersInfo] 已刷新用户信息，活动列表已更新')
      } else {
        console.log('[refreshUsersInfo] 没有用户需要刷新')
      }
    } catch (e) {
      console.error('[refreshUsersInfo] 刷新用户信息失败', e)
    }
  },

  onUnload() {
    // 页面卸载时关闭监听
    if (this.data.activityWatcher) {
      this.data.activityWatcher.close()
      this.setData({ activityWatcher: null })
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
        console.log(`请求失败，第${i + 1}次重试...`, e)
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * (i + 1)))
        }
      }
    }
    throw lastError
  },

  // 加载活动列表 - 智能刷新策略
  // @param {boolean} forceRefreshUsers - 是否强制刷新用户缓存（默认 false）
  async loadActivities(enableWatch = false, forceRefreshUsers = false) {
    this.setData({ loading: true })
    try {
      const openid = app.globalData.openid || wx.getStorageSync('openid')
      const filter = this.data.activeFilter
      const now = new Date()

      // 获取全部活动（带重试）
      let query = db.collection('activities').orderBy('createdAt', 'desc')

      // 根据筛选条件过滤
      if (filter === 'upcoming') {
        query = db.collection('activities').where({
          status: 'open',
          activityDate: db.command.gt(now)
        }).orderBy('createdAt', 'desc')
      } else if (filter === 'ongoing') {
        query = db.collection('activities').where({
          status: 'ongoing'
        }).orderBy('createdAt', 'desc')
      } else if (filter === 'finished') {
        query = db.collection('activities').where({
          status: db.command.in(['finished', 'cancelled'])
        }).orderBy('createdAt', 'desc')
      }

      const res = await this.requestWithRetry(() => query.limit(50).get())
      let activities = res.data

      // 收集所有需要查询的用户ID
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
          // 使用全局缓存系统（forceRefresh 参数在首次加载时使用）
          latestUsers = await app.fetchUsersWithCache(Array.from(allUserIds), forceRefresh || false)
        } catch (e) {
          console.log('获取用户信息失败', e)
        }
      }

      const formattedActivities = activities.map(act => this.formatActivity(act, openid, latestUsers))
      this.setData({ activities: formattedActivities, loading: false })

      // 启用数据库监听（只监听最近 7 天的活动，减少性能影响）
      if (!this.data.activityWatcher) {
        this.startActivityWatcher(openid, latestUsers)
      }
    } catch (e) {
      console.error('加载活动失败', e)
      this.setData({ loading: false })
      wx.showToast({ title: '网络异常，请稍后重试', icon: 'none', duration: 2000 })
    }
  },

  // 启动数据库监听（实时更新）
  startActivityWatcher(openid, latestUsers = {}) {
    // 先关闭旧监听
    if (this.data.activityWatcher) {
      this.data.activityWatcher.close()
    }

    // 只监听最近 7 天创建的活动（减少监听范围）
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const watcher = db.collection('activities')
      .where({
        createdAt: db.command.gte(sevenDaysAgo)
      })
      .watch({
        onChange: async (snapshot) => {
          console.log('活动数据实时更新:', snapshot.docs.length)

          // 重新获取用户信息（可能有新用户加入）
          const allUserIds = new Set()
          snapshot.docs.forEach(act => {
            const regs = act.registrations || []
            regs.forEach(r => {
              if (r.openid) allUserIds.add(r.openid)
            })
          })

          let newLatestUsers = { ...latestUsers }
          if (allUserIds.size > 0) {
            try {
              // 使用全局缓存系统
              newLatestUsers = await app.fetchUsersWithCache(Array.from(allUserIds))
            } catch (e) {
              console.log('实时更新用户信息失败', e)
            }
          }

          // 更新活动列表
          const formattedActivities = snapshot.docs.map(act =>
            this.formatActivity(act, openid, newLatestUsers)
          )
          this.setData({
            activities: formattedActivities,
            latestUsers: newLatestUsers
          })
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
  formatActivity(act, openid, latestUsers = {}) {
    const registrations = act.registrations || []
    const confirmed = registrations.filter(r => r.status === 'confirmed')
    const pending = registrations.filter(r => r.status === 'pending')
    const leave = registrations.filter(r => r.status === 'leave')
    const myReg = registrations.find(r => r.openid === openid)

    // 进度百分比
    const percent = Math.min((confirmed.length / act.maxPlayers) * 100, 100)

    // 活动日期格式化
    const actDate = act.activityDate instanceof Date ? act.activityDate : new Date(act.activityDate)
    const displayDate = this.formatDate(actDate)

    // 判断是否是发布者
    const isCreator = act.createdBy === openid

    // 状态
    let statusText, statusClass, canEdit, canCancel, canDelete
    if (act.status === 'finished') {
      statusText = '已结束'; statusClass = 'tag-gray'
      canEdit = false; canCancel = false; canDelete = isCreator
    } else if (act.status === 'ongoing') {
      statusText = '进行中'; statusClass = 'tag-blue'
      canEdit = false; canCancel = false; canDelete = false
    } else if (act.status === 'cancelled') {
      statusText = '已取消'; statusClass = 'tag-red'
      canEdit = false; canCancel = false; canDelete = isCreator
    } else {
      // open 状态：只有创建者可以编辑/取消
      statusText = '报名中'; statusClass = 'tag-green'
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
    const confirmedPlayers = confirmed.slice(0, 6).map(r => {
      const latestUser = latestUsers[r.openid]
      console.log('[index] 处理球员:', r.openid, 'latestUser存在:', !!latestUser, '使用头像:', latestUser?.avatarUrl || r.avatarUrl)
      return {
        ...r,
        nickName: latestUser?.nickName || r.nickName,
        avatarUrl: latestUser?.avatarUrl || r.avatarUrl,
        shortName: (latestUser?.nickName || r.nickName) ? (latestUser?.nickName || r.nickName).slice(0, 8) : '队员',
        firstPosition: getFirstPosition(latestUser?.positions || r.position) // 首选位置（前2个字）
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

    return {
      ...actWithDefaults,
      confirmedCount: confirmed.length,
      pendingCount: pending.length,
      leaveCount: leave.length,
      confirmedPlayers,
      progressPercent: Math.round(percent),
      displayDate,
      statusText,
      statusClass,
      isCreator,
      canEdit,
      canCancel,
      canDelete,
      myStatus,
      myStatusText,
      myStatusClass
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

    console.log('========== 取消活动调试信息 ==========')
    console.log('活动ID:', id)
    console.log('当前用户 openid:', openid)
    console.log('活动创建者 createdBy:', activity?.createdBy)
    console.log('活动 status:', activity?.status)
    console.log('是否创建者:', activity?.createdBy === openid)
    console.log('活动对象:', activity)
    console.log('========================================')

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
      console.log('取消活动成功:', updateRes)
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
