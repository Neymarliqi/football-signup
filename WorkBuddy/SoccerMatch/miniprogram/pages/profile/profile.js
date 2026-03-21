// pages/profile/profile.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    userInfo: {},
    shortOpenid: '',
    editingName: false,
    tempName: '',
    placeholderAvatar: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0',
    positions: [
      { value: 'GK', label: '守门员', emoji: '🧤' },
      { value: 'CB', label: '中后卫', emoji: '🛡' },
      { value: 'LB', label: '边后卫', emoji: '↩' },
      { value: 'CM', label: '中场', emoji: '⚙' },
      { value: 'CAM', label: '前腰', emoji: '🎯' },
      { value: 'LW', label: '边锋', emoji: '⚡' },
      { value: 'ST', label: '中锋', emoji: '🎯' },
      { value: 'ALL', label: '全能', emoji: '⭐' }
    ],
    myStats: {
      totalGames: 0,
      confirmedCount: 0,
      pendingCount: 0,
      leaveCount: 0
    },
    history: [],
    isAdmin: false,
    isDev: false
  },

  onLoad() {
    this.loadUserInfo()
    // 判断是否是开发环境（可以通过配置或特定条件判断）
    const isDev = wx.getAccountInfoSync().miniProgram.envVersion === 'develop'
    this.setData({ isDev })
  },

  onShow() {
    this.setData({ isAdmin: app.globalData.isAdmin })
    this.loadUserInfo()
    this.loadHistory()
  },

  loadUserInfo() {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || {}
    const openid = app.globalData.openid || wx.getStorageSync('openid') || ''
    const shortOpenid = openid ? openid.slice(-6).toUpperCase() : '------'
    this.setData({ userInfo, shortOpenid })
  },

  // 选择头像
  chooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: async (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        wx.showLoading({ title: '上传中...' })
        try {
          // 上传到云存储
          const openid = app.globalData.openid || wx.getStorageSync('openid')
          const ext = tempPath.split('.').pop()
          const cloudPath = `avatars/${openid}.${ext}`
          
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath: tempPath
          })
          
          const avatarUrl = uploadRes.fileID
          const userInfo = { ...this.data.userInfo, avatarUrl }
          this.saveUserInfo(userInfo)
          wx.hideLoading()
          wx.showToast({ title: '头像更新成功', icon: 'success' })
        } catch (e) {
          wx.hideLoading()
          console.error('上传头像失败', e)
          // 降级：直接使用临时路径
          const userInfo = { ...this.data.userInfo, avatarUrl: tempPath }
          this.saveUserInfo(userInfo)
        }
      }
    })
  },

  startEditName() {
    this.setData({ editingName: true, tempName: this.data.userInfo.nickName || '' })
  },

  onNameInput(e) {
    this.setData({ tempName: e.detail.value })
  },

  saveName() {
    const { tempName, userInfo } = this.data
    if (!tempName.trim()) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' })
      return
    }
    const updated = { ...userInfo, nickName: tempName.trim() }
    this.saveUserInfo(updated)
    this.setData({ editingName: false })
    wx.showToast({ title: '昵称已保存', icon: 'success' })
  },

  cancelEditName() {
    this.setData({ editingName: false })
  },

  selectPosition(e) {
    const pos = e.currentTarget.dataset.pos
    const userInfo = { ...this.data.userInfo, position: pos }
    this.saveUserInfo(userInfo)
    wx.showToast({ title: '位置偏好已保存', icon: 'success' })
  },

  saveUserInfo(userInfo) {
    app.globalData.userInfo = userInfo
    wx.setStorageSync('userInfo', userInfo)
    this.setData({ userInfo })

    // 同步到云数据库
    const openid = app.globalData.openid || wx.getStorageSync('openid')
    if (!openid) return

    const db = wx.cloud.database()
    db.collection('users').where({ openid }).get().then(res => {
      if (res.data.length > 0) {
        db.collection('users').doc(res.data[0]._id).update({
          data: { ...userInfo, updatedAt: db.serverDate() }
        })
      } else {
        db.collection('users').add({
          data: { ...userInfo, openid, createdAt: db.serverDate() }
        })
      }
    })
  },

  // 加载历史记录
  async loadHistory() {
    const openid = app.globalData.openid || wx.getStorageSync('openid')
    if (!openid) return

    try {
      const res = await db.collection('activities')
        .orderBy('activityDate', 'desc')
        .limit(20)
        .get()

      const allActivities = res.data
      const myActivities = allActivities.filter(act => {
        const regs = act.registrations || []
        return regs.some(r => r.openid === openid)
      })

      let totalGames = 0, confirmedCount = 0, pendingCount = 0, leaveCount = 0

      const history = myActivities.map(act => {
        const myReg = (act.registrations || []).find(r => r.openid === openid)
        const actDate = act.activityDate instanceof Date ? act.activityDate : new Date(act.activityDate)
        
        if (myReg?.status === 'confirmed') { confirmedCount++; totalGames++ }
        if (myReg?.status === 'pending') pendingCount++
        if (myReg?.status === 'leave') leaveCount++

        const statusMap = {
          confirmed: { text: '✅ 报名', cls: 'tag-green' },
          pending: { text: '⏳ 待定', cls: 'tag-yellow' },
          leave: { text: '🙅 请假', cls: 'tag-red' }
        }

        return {
          ...act,
          myStatus: myReg?.status,
          myStatusText: statusMap[myReg?.status]?.text || '',
          myStatusClass: statusMap[myReg?.status]?.cls || '',
          displayDate: this.formatDate(actDate)
        }
      })

      this.setData({
        history,
        myStats: { totalGames, confirmedCount, pendingCount, leaveCount }
      })
    } catch (e) {
      console.error('加载历史失败', e)
    }
  },

  formatDate(date) {
    const m = date.getMonth() + 1
    const d = date.getDate()
    return `${m}月${d}日`
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/activity/detail?id=${id}` })
  },

  clearCache() {
    wx.showModal({
      title: '确认清除',
      content: '清除缓存后需重新登录',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync()
          wx.showToast({ title: '已清除缓存', icon: 'success' })
        }
      }
    })
  },

  contactAdmin() {
    wx.showToast({ title: '请联系队长', icon: 'none' })
  },

  about() {
    wx.showModal({
      title: '约球助手 v1.0',
      content: '⚽ 专为足球队设计的约球报名小程序\n功能：活动报名、战术板、队员管理\n\n有建议欢迎联系管理员',
      showCancel: false
    })
  },

  applyAdmin() {
    wx.showModal({
      title: '申请管理员',
      content: '申请成为管理员后可发布活动和安排战术，请联系当前管理员审核',
      showCancel: false
    })
  },

  goAdmin() {
    wx.navigateTo({ url: '/pages/admin/admin' })
  },

  // 生成测试数据
  async seedTestData() {
    const openid = app.globalData.openid || wx.getStorageSync('openid')
    if (!openid) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    wx.showModal({
      title: '生成测试数据',
      content: '将生成10条测试数据（4条我发布的 + 4条我报名的 + 2条其他人的），是否继续？',
      success: async (res) => {
        if (!res.confirm) return

        wx.showLoading({ title: '生成中...' })
        try {
          const result = await wx.cloud.callFunction({
            name: 'seedTestData',
            data: { myOpenid: openid }
          })
          
          wx.hideLoading()
          if (result.result.success) {
            wx.showModal({
              title: '生成成功',
              content: `已生成 ${result.result.data.total} 条测试数据：\n• 我发布的：${result.result.data.myPublished} 条\n• 我报名的：${result.result.data.myRegistered} 条\n• 其他人的：${result.result.data.others} 条\n\n请返回首页查看效果`,
              showCancel: false
            })
          } else {
            wx.showToast({ title: result.result.message || '生成失败', icon: 'none' })
          }
        } catch (e) {
          wx.hideLoading()
          console.error('生成测试数据失败', e)
          wx.showToast({ title: '生成失败', icon: 'none' })
        }
      }
    })
  }
})
