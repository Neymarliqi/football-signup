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
    // 头像昵称弹窗相关
    showUserInfoModal: false,
    tempAvatarUrl: '',
    tempNickName: '',
    defaultAvatarUrl: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'
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

    const confirmedPlayers = confirmed.map(r => ({ ...r, registerTimeText: fmtTime(r.registerTime) }))
    const pendingPlayers = pending.map(r => ({ ...r, registerTimeText: fmtTime(r.registerTime) }))
    const leavePlayers = leave.map(r => ({ ...r, registerTimeText: fmtTime(r.registerTime) }))

    // 活动状态
    const now = new Date()
    const actDate = act.activityDate instanceof Date ? act.activityDate : new Date(act.activityDate)
    let statusText, statusClass
    if (act.status === 'finished' || actDate < now) {
      statusText = '已结束'; statusClass = 'tag-gray'
    } else if (act.status === 'cancelled') {
      statusText = '已取消'; statusClass = 'tag-red'
    } else {
      statusText = '报名中'; statusClass = 'tag-green'
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

    // 格式化日期
    const displayDate = this.formatDate(actDate)

    this.setData({
      activity: { ...act, statusText, statusClass, displayDate },
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
      myStatusClass
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

  // 报名
  async register(e) {
    const status = e.currentTarget.dataset.status
    const userInfo = app.globalData.userInfo

    // 检查是否有头像昵称
    if (!userInfo || !userInfo.avatarUrl || !userInfo.nickName) {
      // 显示弹窗，引导用户填写头像昵称
      this.setData({
        showUserInfoModal: true,
        tempAvatarUrl: userInfo?.avatarUrl || this.data.defaultAvatarUrl,
        tempNickName: userInfo?.nickName || ''
      })
      return
    }

    // 请假需要填写原因
    if (status === 'leave') {
      wx.showModal({
        title: '请假原因（可选）',
        editable: true,
        placeholderText: '请输入请假原因...',
        success: async (res) => {
          if (res.confirm) {
            await this.doRegister(status, res.content || '')
          }
        }
      })
      return
    }

    await this.doRegister(status, '')
  },

  async doRegister(status, leaveReason) {
    const { activityId, confirmedCount } = this.data
    const openid = app.globalData.openid || wx.getStorageSync('openid')
    const userInfo = app.globalData.userInfo

    if (status === 'confirmed' && confirmedCount >= this.data.activity.maxPlayers) {
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

  changeStatus(e) {
    const status = e.currentTarget.dataset.status
    if (status === 'leave') {
      wx.showModal({
        title: '请假原因（可选）',
        editable: true,
        placeholderText: '请输入请假原因...',
        success: async (res) => {
          if (res.confirm) {
            await this.doRegister(status, res.content || '')
          }
        }
      })
      return
    }
    this.doRegister(status, '')
  },

  async cancelRegister() {
    wx.showModal({
      title: '确认取消',
      content: '确定要取消报名吗？',
      success: async (res) => {
        if (res.confirm) {
          const { activityId } = this.data
          const openid = app.globalData.openid || wx.getStorageSync('openid')
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
            wx.showToast({ title: '操作失败', icon: 'error' })
          }
        }
      }
    })
  },

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
    wx.navigateTo({ url: `/pages/activity/create?id=${this.data.activityId}` })
  },

  // 分享
  onShareAppMessage() {
    const { activity, activityId } = this.data
    return {
      title: `⚽ ${activity.title} - 快来报名！`,
      path: `/pages/activity/detail?id=${activityId}`,
      imageUrl: ''
    }
  },

  // ====== 头像昵称弹窗相关 ======

  // 选择头像
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    this.setData({ tempAvatarUrl: avatarUrl })
  },

  // 输入昵称
  onNickNameInput(e) {
    this.setData({ tempNickName: e.detail.value })
  },

  // 关闭弹窗
  closeUserInfoModal() {
    this.setData({ showUserInfoModal: false })
  },

  // 保存用户信息
  async saveUserInfo() {
    const { tempAvatarUrl, tempNickName } = this.data

    if (!tempNickName || tempNickName.trim() === '') {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    // 上传头像到云存储
    let avatarUrl = tempAvatarUrl
    if (!tempAvatarUrl.startsWith('cloud://') && !tempAvatarUrl.startsWith('http')) {
      // 临时文件路径，需要上传到云存储
      try {
        wx.showLoading({ title: '上传头像...' })
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath: `avatars/${Date.now()}.jpg`,
          filePath: tempAvatarUrl
        })
        avatarUrl = uploadRes.fileID
        wx.hideLoading()
      } catch (e) {
        wx.hideLoading()
        console.error('上传头像失败', e)
        wx.showToast({ title: '上传头像失败', icon: 'none' })
        return
      }
    }

    // 更新用户信息到数据库
    try {
      const openid = app.globalData.openid || wx.getStorageSync('openid')
      await db.collection('users').doc(openid).set({
        data: {
          nickName: tempNickName,
          avatarUrl: avatarUrl,
          position: '',
          updatedAt: new Date()
        }
      })

      // 更新全局数据
      app.globalData.userInfo = {
        nickName: tempNickName,
        avatarUrl: avatarUrl,
        position: ''
      }

      this.setData({ showUserInfoModal: false })
      wx.showToast({ title: '保存成功！', icon: 'success' })

      // 重新加载活动，显示报名状态
      this.loadActivity()
    } catch (e) {
      console.error('保存用户信息失败', e)
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  }
})
