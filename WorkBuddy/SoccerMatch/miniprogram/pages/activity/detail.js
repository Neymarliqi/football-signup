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
    // 头像昵称弹窗
    showUserInfoModal: false,
    tempAvatarUrl: '',
    tempNickName: '',
    defaultAvatarUrl: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0',
    // 本地默认头像不存在，使用网络默认头像
    placeholderAvatar: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0',
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

  onShow() {
    this.loadActivity()
  },

  async loadActivity() {
    const { activityId } = this.data
    if (!activityId) return

    wx.showNavigationBarLoading()
    try {
      const res = await db.collection('activities').doc(activityId).get()
      const act = res.data
      const openid = app.globalData.openid || wx.getStorageSync('openid')

      this.processActivity(act, openid)
    } catch (e) {
      console.error('加载活动详情失败', e)
      wx.showToast({ title: '加载失败', icon: 'error' })
    } finally {
      wx.hideNavigationBarLoading()
    }
  },

  processActivity(act, openid) {
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
    const confirmedPlayers = confirmed.slice(0, MAX_DISPLAY).map(r => ({ ...r, registerTimeText: fmtTime(r.registerTime) }))
    const pendingPlayers = pending.slice(0, MAX_DISPLAY).map(r => ({ ...r, registerTimeText: fmtTime(r.registerTime) }))
    const leavePlayers = leave.slice(0, MAX_DISPLAY).map(r => ({ ...r, registerTimeText: fmtTime(r.registerTime) }))

    // 活动状态
    const now = new Date()
    const actDate = act.activityDate instanceof Date ? act.activityDate : new Date(act.activityDate)
    let statusText, statusClass, effectiveStatus
    if (act.status === 'finished' || actDate < now) {
      statusText = '已结束'; statusClass = 'tag-gray'; effectiveStatus = 'finished'
    } else if (act.status === 'cancelled') {
      statusText = '已取消'; statusClass = 'tag-red'; effectiveStatus = 'cancelled'
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

    this.setData({
      activity: { ...act, statusText, statusClass, displayDate, effectiveStatus },
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
    const userInfo = app.globalData.userInfo

    // 检查用户信息是否完整
    if (!userInfo || !userInfo.avatarUrl || !userInfo.nickName) {
      // 保存待执行的操作，获取用户信息后自动执行
      this.pendingAction = action
      this.setData({
        showUserInfoModal: true,
        tempAvatarUrl: '',
        tempNickName: ''
      })
      return
    }

    // 已有头像，显示阅读确认弹窗
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
   * 选择操作
   */
  async onSheetSelect(e) {
    const action = e.currentTarget.dataset.action
    this.closeActionSheet()

    const userInfo = app.globalData.userInfo

    // 检查用户信息是否完整
    if (!userInfo || !userInfo.avatarUrl || !userInfo.nickName) {
      // 保存待执行的操作，获取用户信息后自动执行
      this.pendingAction = action
      this.setData({
        showUserInfoModal: true,
        tempAvatarUrl: '',
        tempNickName: ''
      })
      return
    }

    // 已有头像，显示阅读确认弹窗
    this.pendingAction = action
    this.showConfirmModal()
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
    const userInfo = app.globalData.userInfo

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
          position: userInfo.position || ''
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

  /**
   * 选择头像
   */
  onChooseAvatar(e) {
    this.setData({ tempAvatarUrl: e.detail.avatarUrl })
  },

  /**
   * 输入昵称
   */
  onNickNameInput(e) {
    this.setData({ tempNickName: e.detail.value })
  },

  /**
   * 关闭头像昵称弹窗
   */
  closeUserInfoModal() {
    this.setData({ showUserInfoModal: false })
    // 清除待执行的操作
    this.pendingAction = null
  },

  /**
   * 保存用户信息
   */
  async saveUserInfo() {
    const { tempAvatarUrl, tempNickName } = this.data

    if (!tempNickName.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...' })

    try {
      let finalAvatarUrl = tempAvatarUrl

      // 如果选择了头像，上传到云存储
      if (tempAvatarUrl && !tempAvatarUrl.startsWith('cloud://') && !tempAvatarUrl.startsWith('http')) {
        try {
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath: `avatars/${Date.now()}.jpg`,
            filePath: tempAvatarUrl
          })
          finalAvatarUrl = uploadRes.fileID
        } catch (e) {
          console.error('上传头像失败', e)
          finalAvatarUrl = this.data.defaultAvatarUrl
        }
      }

      // 如果没有头像，使用默认头像
      if (!finalAvatarUrl) {
        finalAvatarUrl = this.data.defaultAvatarUrl
      }

      const openid = app.globalData.openid || wx.getStorageSync('openid')

      // 保存到数据库
      await db.collection('users').doc(openid).set({
        data: {
          nickName: tempNickName,
          avatarUrl: finalAvatarUrl,
          position: '',
          updatedAt: new Date()
        }
      })

      // 更新全局数据
      const userInfo = {
        nickName: tempNickName,
        avatarUrl: finalAvatarUrl,
        position: ''
      }
      app.globalData.userInfo = userInfo

      wx.hideLoading()
      this.setData({ showUserInfoModal: false })
      
      // 如果有待执行的操作，显示阅读确认弹窗
      if (this.pendingAction) {
        this.showConfirmModal()
      } else {
        wx.showToast({ title: '保存成功', icon: 'success' })
        this.loadActivity()
      }
    } catch (e) {
      wx.hideLoading()
      console.error('保存用户信息失败', e)
      wx.showToast({ title: '保存失败', icon: 'error' })
    }
  },

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
      // 没有经纬度，提示
      wx.showModal({
        title: '提示',
        content: '该活动未设置经纬度，无法调起地图导航\n\n请发布活动时在地图上选择位置',
        showCancel: false
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

  // 分享
  onShare() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
  },

  // 分享
  onShareAppMessage() {
    const { activity, activityId } = this.data
    return {
      title: `⚽ ${activity.title} - 快来报名！`,
      path: `/pages/activity/detail?id=${activityId}`,
      imageUrl: ''
    }
  }
})
