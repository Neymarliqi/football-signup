// pages/activity/detail.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    activityId: '',
    activity: {},
    confirmedPlayers: [],
    pendingPlayers: [],
    leavePlayers: [],
    confirmedCount: 0,
    pendingCount: 0,
    leaveCount: 0,
    totalCount: 0,
    progressPercent: 0,
    myStatus: null,
    myStatusText: '',
    myStatusClass: '',
    isAdmin: false,
    isCreator: false,
    canEdit: false,
    loading: true,
    // 数据库监听器
    activityWatcher: null,
    // 注册弹窗
    showRegisterModal: false,
    // 操作选择弹窗
    showActionSheet: false,
    // 请假原因弹窗
    showLeaveReasonModal: false,
    leaveReason: '',
    pendingAction: null,
    // 阅读活动描述确认弹窗
    showConfirmModal: false,
    confirmCountdown: 3,
    confirmBtnEnabled: false,
    confirmTimer: null,
    // 活动描述展开状态
    isDescExpanded: false
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

  // 切换活动描述展开/收起
  toggleDescExpand() {
    this.setData({
      isDescExpanded: !this.data.isDescExpanded
    })
  },

  onLoad(options) {
    const id = options.id
    this.setData({ activityId: id, isAdmin: app.globalData.isAdmin })
    this.loadActivity()
  },

  onUnload() {
    // 页面卸载时关闭监听
    if (this.data.activityWatcher) {
      this.data.activityWatcher.close()
      this.setData({ activityWatcher: null })
    }
  },

  onShow() {
    // 重新加载最新的用户信息（确保位置数据是最新的）
    const localUserInfo = wx.getStorageSync('userInfo')
    if (localUserInfo) {
      app.globalData.userInfo = localUserInfo
    }

    this.loadActivity(true) // 传入 true，强制刷新用户缓存
  },

  // 注册完成回调
  onRegistered() {
    this.setData({ showRegisterModal: false })
    this.loadActivity(true)
    // 注册完成后执行之前被拦截的操作
    if (this._pendingAction) {
      const action = this._pendingAction
      this._pendingAction = null
      // 延迟执行，确保数据已刷新
      setTimeout(() => {
        if (action === 'confirmed') {
          // 先设置 pendingAction，再弹确认弹窗（confirmRegister 依赖 this.pendingAction）
          this.pendingAction = action
          this.showConfirmModal()
        } else {
          // 待定/请假直接执行
          wx.showLoading({ title: '处理中...' })
          this.doRegister(action, '')
        }
      }, 300)
    }
  },

  // 关闭注册弹窗
  onCloseRegister() {
    this.setData({ showRegisterModal: false })
    this._pendingAction = null
  },

  // 检查注册状态，未注册则弹窗
  checkRegisterBeforeAction(action) {
    if (!app.isUserRegistered()) {
      this._pendingAction = action
      this.setData({ showRegisterModal: true })
      return false
    }
    return true
  },

  async loadActivity(forceRefreshUsers = false) {
    const { activityId } = this.data
    if (!activityId) return

    this.setData({ loading: true })
    wx.showNavigationBarLoading()
    try {
      // 使用重试机制获取活动数据
      const res = await this.requestWithRetry(() => db.collection('activities').doc(activityId).get())
      const act = res.data
      const openid = app.globalData.openid || wx.getStorageSync('openid')

      // 收集所有报名用户ID
      const registrations = act.registrations || []
      const userIds = registrations.map(r => r.openid).filter(id => id)

      // 批量获取最新用户信息（带缓存）
      let latestUsers = {}
      if (userIds.length > 0) {
        try {
          // 使用全局缓存系统（onShow 时强制刷新）
          latestUsers = await app.fetchUsersWithCache(userIds, forceRefreshUsers)
        } catch (e) {
        }
      }

      await this.processActivity(act, openid, latestUsers)
      this.setData({ loading: false })

      // 启动数据库监听（只监听当前活动）
      this.startActivityWatcher(activityId, openid)
    } catch (e) {
      console.error('加载活动详情失败', e)
      this.setData({ loading: false })
      wx.showToast({ title: '网络异常，请稍后重试', icon: 'none', duration: 2000 })
    } finally {
      wx.hideNavigationBarLoading()
    }
  },

  // 启动数据库监听（实时更新当前活动）
  startActivityWatcher(activityId, openid) {
    // 先关闭旧监听
    if (this.data.activityWatcher) {
      this.data.activityWatcher.close()
    }

    // 只监听当前活动（精确监听）
    const watcher = db.collection('activities')
      .doc(activityId)
      .watch({
        onChange: async (snapshot) => {

          const act = snapshot.docs[0]
          if (!act) return

          // 收集所有报名用户ID
          const registrations = act.registrations || []
          const userIds = registrations.map(r => r.openid).filter(id => id)

          // 获取最新用户信息（使用全局缓存系统）
          let latestUsers = {}
          if (userIds.length > 0) {
            try {
              latestUsers = await app.fetchUsersWithCache(userIds)
            } catch (e) {
            }
          }

          // 更新活动数据
          await this.processActivity(act, openid, latestUsers)
        },
        onError: (err) => {
          console.error('活动详情监听失败', err)
          // 监听失败后回退到定时刷新
          setTimeout(() => {
            this.loadActivity()
          }, 5000)
        }
      })

    this.setData({ activityWatcher: watcher })
  },

  async processActivity(act, openid, latestUsers = {}) {
    const registrations = act.registrations || []
    const confirmed = registrations.filter(r => r.status === 'confirmed')
    const pending = registrations.filter(r => r.status === 'pending')
    const leave = registrations.filter(r => r.status === 'leave')
    const myReg = registrations.find(r => r.openid === openid)

    const progressPercent = Math.min(Math.round((confirmed.length / act.maxPlayers) * 100), 100)

    // 格式化报名时间
    const fmtTime = (ts) => {
      if (!ts) return ''
      const d = ts instanceof Date ? ts : new Date(ts)
      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    }

    // 详情页最多显示30人，防止数据过多影响性能
    const MAX_DISPLAY = 30
    
    // 位置代码映射表 - 统一使用"中文名称 + 英文代码"格式
    const posMap = {
      'ALL': '全能 ALL',
      'GK': '守门员 GK', 'LB': '左后卫 LB', 'CB': '中后卫 CB', 'RB': '右后卫 RB',
      'LWB': '左翼卫 LWB', 'RWB': '右翼卫 RWB',
      'CDM': '后腰 CDM', 'CM': '中场 CM', 'LM': '左中场 LM', 'RM': '右中场 RM',
      'CAM': '前腰 CAM', 'LW': '左边锋 LW', 'RW': '右边锋 RW',
      'ST': '中锋 ST', 'CF': '前锋 CF'
    }
    
    // 处理位置信息：从用户的positions数组中读取首选位置（order=1）
    const processPosition = (position) => {
      if (!position) return null
      
      // 支持新格式（对象数组）和旧格式（字符串）
      let firstPosCode = ''
      
      if (typeof position === 'string') {
        // 旧格式：逗号分隔的字符串
        const positions = position.split(/[,，\/\s]+/).filter(p => p.trim())
        firstPosCode = positions[0]
      } else if (Array.isArray(position)) {
        // 新格式：数组
        // 查找order=1的首选位置
        const firstPosItem = position.find(p => 
          typeof p === 'object' ? p.order === 1 : position.indexOf(p) === 0
        )
        firstPosCode = typeof firstPosItem === 'object' 
          ? firstPosItem.value 
          : firstPosItem
      }
      
      if (!firstPosCode) return null
      
      const chinesePosition = posMap[firstPosCode.trim().toUpperCase()] || firstPosCode.trim()
      return {
        firstPosition: chinesePosition.substring(0, 2) // 头像上只显示前2个字，与首页一致
      }
    }
    
    // 处理球员列表 - 使用最新用户信息
    // base64 直接用，不走云存储权限
    const processPlayer = (r) => {
      const latestUser = latestUsers[r.openid]
      const posInfo = processPosition(latestUser?.positions || r.position)
      return { 
        ...r, 
        nickName: latestUser?.nickName || r.nickName,
        displayAvatar: app.getDisplayAvatar(latestUser) || app.globalData.defaultAvatar,
        registerTimeText: fmtTime(r.registerTime),
        ...posInfo
      }
    }

    const confirmedPlayers = confirmed.slice(0, MAX_DISPLAY).map(processPlayer)
    const pendingPlayers = pending.slice(0, MAX_DISPLAY).map(processPlayer)
    const leavePlayers = leave.slice(0, MAX_DISPLAY).map(processPlayer)

    // 活动状态
    const now = new Date()
    const actDate = act.activityDate instanceof Date ? act.activityDate : new Date(act.activityDate)
    let statusText, statusClass, effectiveStatus
    if (act.status === 'finished' || actDate < now) {
      statusText = '已结束'; statusClass = 'tag-gray'; effectiveStatus = 'finished'
    } else if (act.status === 'cancelled') {
      statusText = '已取消'; statusClass = 'tag-red'; effectiveStatus = 'cancelled'
    } else if (act.status === 'ongoing') {
      statusText = '进行中'; statusClass = 'tag-blue'; effectiveStatus = 'ongoing'
    } else {
      statusText = '报名中'; statusClass = 'tag-green'; effectiveStatus = 'open'
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

    // 判断是否是发布者且活动未开始（可以编辑）
    const isCreator = act.createdBy === openid
    // 使用 effectiveStatus 判断，确保根据日期计算的状态也能正确控制权限
    const canEdit = isCreator && effectiveStatus === 'open' && actDate > now

    // 格式化日期
    const displayDate = this.formatDate(actDate)

    // 确保所有字段都有默认值，避免 undefined 显示问题
    const activityWithDefaults = {
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
      ...act,
      statusText,
      statusClass,
      displayDate,
      effectiveStatus
    }

    this.setData({
      activity: activityWithDefaults,
      confirmedPlayers,
      pendingPlayers,
      leavePlayers,
      confirmedCount: confirmed.length,
      pendingCount: pending.length,
      leaveCount: leave.length,
      totalCount: registrations.length,
      progressPercent,
      myStatus,
      myStatusText,
      myStatusClass,
      isCreator,
      canEdit
    })

    wx.setNavigationBarTitle({ title: act.title || '活动详情' })
  },

  formatDate(date) {
    const y = date.getFullYear()
    const m = date.getMonth() + 1
    const d = date.getDate()
    const weekdays = ['日', '一', '二', '三', '四', '五', '六']
    const w = weekdays[date.getDay()]
    return `${y}年${m}月${d}日 周${w}`
  },

  // ==================== 底部操作栏新逻辑 ====================
  
  // 待执行的操作（用于获取用户信息后自动执行）
  pendingAction: null,

  /**
   * 主操作按钮点击
   */
  async onMainAction(e) {
    const action = e.currentTarget.dataset.action

    // 注册检查：未注册用户先引导注册
    if (!this.checkRegisterBeforeAction(action)) return

    // 显示阅读确认弹窗
    this.pendingAction = action
    this.showConfirmModal()
  },

  /**
   * 显示操作选择弹窗
   */
  showActionSheet() {
    this.setData({ showActionSheet: true })
  },

  /**
   * 关闭操作选择弹窗
   */
  closeActionSheet() {
    this.setData({ showActionSheet: false })
  },

  /**
   * 选择操作（待定/请假）
   * 注意：待定和请假不需要阅读确认弹窗，直接执行
   */
  async onSheetSelect(e) {
    const action = e.currentTarget.dataset.action
    this.closeActionSheet()

    // 注册检查：未注册用户先引导注册
    if (!this.checkRegisterBeforeAction(action)) return

    // 已有头像，待定/请假直接执行，不需要阅读确认弹窗
    wx.showLoading({ title: '处理中...' })
    await this.doRegister(action, '')
  },

  /**
   * 阻止滚动穿透
   */
  preventScroll() {
    return
  },

  // ==================== 阅读确认弹窗 ====================

  /**
   * 显示阅读确认弹窗
   */
  showConfirmModal() {
    this.setData({
      showConfirmModal: true,
      confirmCountdown: 3,
      confirmBtnEnabled: false
    })
    this.startConfirmCountdown()
  },

  /**
   * 关闭阅读确认弹窗
   */
  closeConfirmModal() {
    // 清除定时器
    if (this.data.confirmTimer) {
      clearInterval(this.data.confirmTimer)
    }
    this.setData({
      showConfirmModal: false,
      confirmTimer: null,
      pendingAction: null
    })
  },

  /**
   * 开始倒计时
   */
  startConfirmCountdown() {
    const timer = setInterval(() => {
      const countdown = this.data.confirmCountdown - 1
      if (countdown <= 0) {
        clearInterval(timer)
        this.setData({
          confirmCountdown: 0,
          confirmBtnEnabled: true,
          confirmTimer: null
        })
      } else {
        this.setData({
          confirmCountdown: countdown,
          confirmTimer: timer
        })
      }
    }, 1000)
    this.setData({ confirmTimer: timer })
  },

  /**
   * 确认报名
   */
  async confirmRegister() {
    if (!this.data.confirmBtnEnabled) return
    
    const action = this.pendingAction
    this.closeConfirmModal()
    
    wx.showLoading({ title: '报名中...' })
    await this.doRegister(action, '')
  },

  // ==================== 请假原因弹窗 ====================

  /**
   * 输入请假原因
   */
  onLeaveReasonInput(e) {
    this.setData({ leaveReason: e.detail.value })
  },

  /**
   * 关闭请假原因弹窗
   */
  closeLeaveReasonModal() {
    this.setData({
      showLeaveReasonModal: false,
      leaveReason: '',
      pendingAction: null
    })
  },

  /**
   * 确认请假
   */
  async confirmLeave() {
    const { leaveReason, pendingAction } = this.data
    this.closeLeaveReasonModal()
    await this.doRegister(pendingAction, leaveReason.trim())
  },

  // ==================== 报名相关逻辑 ====================

  /**
   * 取消报名
   */
  async cancelRegister() {
    const { activityId } = this.data
    const openid = app.globalData.openid || wx.getStorageSync('openid')

    const res = await wx.showModal({
      title: '确认取消',
      content: '确定要取消报名吗？',
      confirmColor: '#ff6b6b'
    })

    if (!res.confirm) return

    wx.showLoading({ title: '取消中...' })
    try {
      await wx.cloud.callFunction({
        name: 'cancelRegistration',
        data: { activityId, openid }
      })
      wx.hideLoading()
      wx.showToast({ title: '已取消报名', icon: 'success' })
      this.loadActivity()
    } catch (e) {
      wx.hideLoading()
      console.error('取消报名失败', e)
      wx.showToast({ title: '操作失败', icon: 'error' })
    }
  },

  /**
   * 执行报名/状态变更
   */
  async doRegister(status, leaveReason) {
    const { activityId, confirmedCount, activity } = this.data
    const openid = app.globalData.openid || wx.getStorageSync('openid')
    // 从本地存储获取最新的 userInfo（确保位置数据是最新的）
    const userInfo = wx.getStorageSync('userInfo') || app.globalData.userInfo || {}

    // 检查是否已满员（报名状态时）
    if (status === 'confirmed' && confirmedCount >= activity.maxPlayers) {
      wx.showToast({ title: '报名人数已满！', icon: 'none' })
      return
    }

    wx.showLoading({ title: '提交中...' })
    try {
      await wx.cloud.callFunction({
        name: 'updateRegistration',
        data: {
          activityId,
          openid,
          status,
          leaveReason,
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          position: userInfo.positions || []  // 存储新的positions数组（包含order信息）
        }
      })

      wx.hideLoading()
      const msgMap = {
        confirmed: '报名成功！⚽',
        pending: '已设为待定',
        leave: '请假成功'
      }
      wx.showToast({ title: msgMap[status], icon: 'success' })
      this.loadActivity()
    } catch (e) {
      wx.hideLoading()
      console.error('报名失败', e)
      wx.showToast({ title: '操作失败，请重试', icon: 'error' })
    }
  },

  // ==================== 头像昵称弹窗 ====================


  // ==================== 其他功能 ====================

  // 打开地图导航（调用腾讯地图）
  openMap() {
    const { activity } = this.data

    if (activity.latitude && activity.longitude) {
      // 有经纬度，直接调起腾讯地图导航
      wx.openLocation({
        latitude: activity.latitude,
        longitude: activity.longitude,
        scale: 18,
        name: activity.locationName || '踢球地点',
        address: activity.location || ''
      })
    } else if (activity.location) {
      // 没有经纬度但有地址，使用微信内置地图查看位置
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          wx.openLocation({
            latitude: res.latitude,
            longitude: res.longitude,
            scale: 18,
            name: activity.locationName || '踢球地点',
            address: activity.location
          })
        },
        fail: () => {
          wx.showModal({
            title: '提示',
            content: '该活动未设置精确导航位置\n\n建议发布活动时在地图上选择具体位置，以获得更好的导航体验',
            showCancel: false
          })
        }
      })
    } else {
      wx.showToast({ title: '暂无地址信息', icon: 'none' })
    }
  },

  goTactics() {
    wx.navigateTo({ url: `/pages/tactics/tactics?activityId=${this.data.activityId}` })
  },

  editActivity() {
    const { activityId, isCreator, activity } = this.data
    
    // 权限检查：只有创建者可编辑
    if (!isCreator) {
      wx.showToast({ title: '只有发布者可编辑', icon: 'none' })
      return
    }
    
    // 状态检查：只有报名中的活动可编辑
    if (activity.effectiveStatus !== 'open') {
      wx.showToast({ title: '该状态无法编辑', icon: 'none' })
      return
    }
    
    if (!activityId) {
      wx.showToast({ title: '活动ID缺失', icon: 'none' })
      return
    }
    
    wx.navigateTo({ 
      url: `/pages/activity/create?id=${activityId}&mode=edit`
    })
  },

  // 取消活动（发布者权限）
  async cancelActivity() {
    const { activity, isCreator } = this.data
    
    // 权限检查：只有创建者可取消
    if (!isCreator) {
      wx.showToast({ title: '只有发布者可取消活动', icon: 'none' })
      return
    }
    
    // 状态检查：只有报名中的活动可取消
    if (activity.effectiveStatus !== 'open') {
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
      await db.collection('activities').doc(activity._id).update({
        data: {
          status: 'cancelled',
          updatedAt: db.serverDate()
        }
      })
      wx.hideLoading()
      wx.showToast({ title: '活动已取消', icon: 'success' })
      this.loadActivity()
    } catch (e) {
      wx.hideLoading()
      console.error('取消活动失败', e)
      wx.showToast({ title: '取消失败', icon: 'none' })
    }
  },

  // 删除活动（发布者权限，仅取消/结束状态可删除）
  async deleteActivity() {
    const { activity, isCreator } = this.data
    
    // 权限检查：只有创建者可删除
    if (!isCreator) {
      wx.showToast({ title: '无权删除该活动', icon: 'none' })
      return
    }
    
    // 状态检查：只有已取消或已结束的活动可删除
    const canDelete = activity.effectiveStatus === 'cancelled' || activity.effectiveStatus === 'finished'
    if (!canDelete) {
      wx.showToast({ title: '该状态无法删除', icon: 'none' })
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
      await db.collection('activities').doc(activity._id).remove()
      wx.hideLoading()
      wx.showToast({ title: '删除成功', icon: 'success' })
      // 返回首页
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (e) {
      wx.hideLoading()
      console.error('删除活动失败', e)
      wx.showToast({ title: '删除失败', icon: 'none' })
    }
  },

  // 分享到微信好友
  onShareAppMessage() {
    const { activity, activityId } = this.data
    return {
      title: `⚽ ${activity.title} - 快来报名！`,
      path: `/pages/activity/detail?id=${activityId}`,
      imageUrl: '',
      desc: `${activity.displayDate} ${activity.time} | ${activity.locationName}`
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    const { activity, activityId } = this.data
    return {
      title: `⚽ ${activity.title} - 快来报名！`,
      query: `id=${activityId}`,
      imageUrl: ''
    }
  }
})
