// pages/profile/profile.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    userInfo: {},
    shortOpenid: '',
    editingName: false,
    tempName: '',
    showAvatarSheet: false,
    showNameSheet: false,
    wechatUserInfo: {},
    placeholderAvatar: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0',
    positions: [
      { value: 'ALL', label: '全能', emoji: '⭐' },
      { value: 'ST', label: '中锋', emoji: '🎯' },
      { value: 'LW', label: '边锋', emoji: '⚡' },
      { value: 'CAM', label: '前腰', emoji: '🎯' },
      { value: 'CM', label: '中场', emoji: '⚙' },
      { value: 'LB', label: '边后卫', emoji: '↩' },
      { value: 'CB', label: '中后卫', emoji: '🛡' },
      { value: 'GK', label: '守门员', emoji: '🧤' }
    ],
    myStats: {
      totalGames: 0,
      confirmedCount: 0,
      pendingCount: 0,
      leaveCount: 0
    },
    history: [],
    version: '1.0.0'
  },

  onLoad() {
    this.loadUserInfo()
    // 获取小程序版本号
    const accountInfo = wx.getAccountInfoSync()
    const version = accountInfo.miniProgram.version || '1.0.0'
    this.setData({ version })
  },

  onShow() {
    this.loadUserInfo()
    this.loadHistory()
    // 更新TabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
  },

  loadUserInfo() {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || {}
    const openid = app.globalData.openid || wx.getStorageSync('openid') || ''
    const shortOpenid = openid ? openid.slice(-6).toUpperCase() : '------'
    
    // 确保 positions 是数组
    if (!userInfo.positions) {
      userInfo.positions = []
    }
    
    // 处理位置数据，添加选中状态和选择顺序
    const positions = this.data.positions.map(pos => ({
      ...pos,
      isSelected: userInfo.positions.includes(pos.value),
      selectOrder: userInfo.positions.indexOf(pos.value) + 1 // 选择顺序（1、2、3...）
    }))
    
    this.setData({ userInfo, shortOpenid, positions })
  },

  // ==================== 头像选择 ====================
  
  // 显示头像选项弹窗
  showAvatarOptions() {
    // 先显示弹窗
    this.setData({ showAvatarSheet: true })
    
    // 异步获取微信用户信息用于展示
    wx.getUserProfile({
      desc: '用于展示微信头像和昵称',
      success: (res) => {
        this.setData({ wechatUserInfo: res.userInfo })
      },
      fail: () => {
        // 获取失败，尝试用全局数据
        const userInfo = app.globalData.userInfo || {}
        this.setData({ wechatUserInfo: userInfo })
      }
    })
  },

  // 关闭头像选项弹窗
  closeAvatarSheet() {
    this.setData({ showAvatarSheet: false })
  },

  // 使用微信头像
  chooseWechatAvatar() {
    // 直接使用已获取的微信用户信息
    const { wechatUserInfo } = this.data
    
    if (wechatUserInfo && wechatUserInfo.avatarUrl) {
      // 已有微信用户信息，直接使用
      const userInfo = { ...this.data.userInfo, avatarUrl: wechatUserInfo.avatarUrl }
      this.saveUserInfo(userInfo)
      this.closeAvatarSheet()
      wx.showToast({ title: '头像更新成功', icon: 'success' })
    } else {
      // 如果没有获取到，再尝试获取一次
      wx.getUserProfile({
        desc: '用于完善用户资料',
        success: (res) => {
          const { avatarUrl } = res.userInfo
          const userInfo = { ...this.data.userInfo, avatarUrl }
          this.setData({ wechatUserInfo: res.userInfo })
          this.saveUserInfo(userInfo)
          this.closeAvatarSheet()
          wx.showToast({ title: '头像更新成功', icon: 'success' })
        },
        fail: () => {
          wx.showToast({ title: '获取微信头像失败，请重试', icon: 'none' })
        }
      })
    }
  },

  // 从相册选择头像
  chooseAlbumAvatar() {
    this.closeAvatarSheet()
    this.chooseImageAvatar(['album'])
  },

  // 拍照选择头像
  chooseCameraAvatar() {
    this.closeAvatarSheet()
    this.chooseImageAvatar(['camera'])
  },

  // 选择图片头像（相册/拍照）
  chooseImageAvatar(sourceType) {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: sourceType,
      sizeType: ['compressed'],
      success: async (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        wx.showLoading({ title: '上传中...' })
        try {
          // 上传到云存储
          const openid = app.globalData.openid || wx.getStorageSync('openid')
          const ext = tempPath.match(/\.([^.]+)$/) ? tempPath.match(/\.([^.]+)$/)[1] : 'jpg'
          const cloudPath = `avatars/${openid}_${Date.now()}.${ext}`
          
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
          wx.showToast({ title: '上传失败，请重试', icon: 'none' })
        }
      },
      fail: (err) => {
        console.error('选择图片失败', err)
        wx.showToast({ title: '选择图片失败', icon: 'none' })
      }
    })
  },

  // ==================== 昵称选择 ====================
  
  // 显示昵称选项弹窗
  showNameOptions() {
    // 先显示弹窗
    this.setData({ showNameSheet: true })
    
    // 异步获取微信用户信息用于展示
    wx.getUserProfile({
      desc: '用于展示微信头像和昵称',
      success: (res) => {
        this.setData({ wechatUserInfo: res.userInfo })
      },
      fail: () => {
        // 获取失败，尝试用全局数据
        const userInfo = app.globalData.userInfo || {}
        this.setData({ wechatUserInfo: userInfo })
      }
    })
  },

  // 关闭昵称选项弹窗
  closeNameSheet() {
    this.setData({ showNameSheet: false })
  },

  // 使用微信昵称
  chooseWechatName() {
    // 直接使用已获取的微信用户信息
    const { wechatUserInfo } = this.data
    
    if (wechatUserInfo && wechatUserInfo.nickName) {
      // 已有微信用户信息，直接使用
      const userInfo = { ...this.data.userInfo, nickName: wechatUserInfo.nickName }
      this.saveUserInfo(userInfo)
      this.closeNameSheet()
      wx.showToast({ title: '昵称更新成功', icon: 'success' })
    } else {
      // 如果没有获取到，再尝试获取一次
      wx.getUserProfile({
        desc: '用于完善用户资料',
        success: (res) => {
          const { nickName } = res.userInfo
          const userInfo = { ...this.data.userInfo, nickName }
          this.setData({ wechatUserInfo: res.userInfo })
          this.saveUserInfo(userInfo)
          this.closeNameSheet()
          wx.showToast({ title: '昵称更新成功', icon: 'success' })
        },
        fail: () => {
          wx.showToast({ title: '获取微信昵称失败，请重试', icon: 'none' })
        }
      })
    }
  },

  // 手动输入昵称
  chooseManualName() {
    this.closeNameSheet()
    // 延迟一下再显示输入框，避免弹窗动画冲突
    setTimeout(() => {
      this.startEditName()
    }, 300)
  },

  // 阻止滚动穿透
  preventScroll() {
    return false
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

  // 选择位置（多选，按选择顺序排序，参考微信图片选择逻辑）
  selectPosition(e) {
    const pos = e.currentTarget.dataset.pos
    const currentPositions = this.data.userInfo.positions || []
    
    let newPositions
    if (currentPositions.includes(pos)) {
      // 已选中，取消选择
      newPositions = currentPositions.filter(p => p !== pos)
    } else {
      // 未选中，添加到末尾（选择顺序）
      // 最多选择3个位置
      if (currentPositions.length >= 3) {
        wx.showToast({ title: '最多选择3个位置', icon: 'none' })
        return
      }
      newPositions = [...currentPositions, pos]
    }
    
    const userInfo = { ...this.data.userInfo, positions: newPositions }
    
    // 更新位置选中状态和选择顺序
    const positions = this.data.positions.map(p => ({
      ...p,
      isSelected: newPositions.includes(p.value),
      selectOrder: newPositions.indexOf(p.value) + 1 // 选择顺序（1、2、3...）
    }))
    
    this.setData({ userInfo, positions })
    this.saveUserInfo(userInfo)
    // 不显示气泡提醒，只通过高亮和角标反馈
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

  // 加载历史记录（只加载全部用于统计，显示前5条）
  async loadHistory() {
    const openid = app.globalData.openid || wx.getStorageSync('openid')
    if (!openid) return

    try {
      // 获取所有活动用于统计
      const res = await db.collection('activities')
        .orderBy('activityDate', 'desc')
        .get()

      const allActivities = res.data
      const myActivities = allActivities.filter(act => {
        const regs = act.registrations || []
        return regs.some(r => r.openid === openid)
      })

      let totalGames = 0, confirmedCount = 0, pendingCount = 0, leaveCount = 0

      const allHistory = myActivities.map(act => {
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

      // 只显示前5条
      const displayHistory = allHistory.slice(0, 5)
      const hasMore = allHistory.length > 5

      this.setData({
        history: displayHistory,
        historyTotal: allHistory.length,
        hasMoreHistory: hasMore,
        myStats: { totalGames, confirmedCount, pendingCount, leaveCount }
      })
    } catch (e) {
      console.error('加载历史失败', e)
    }
  },

  // 跳转到历史列表页
  goHistoryList() {
    wx.navigateTo({
      url: '/pages/profile/history'
    })
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

  about() {
    const { version } = this.data
    wx.showModal({
      title: `约球助手 v${version}`,
      content: '⚽ 专为足球队设计的约球报名小程序\n功能：活动报名、战术板、队员管理\n\n有建议欢迎联系管理员',
      showCancel: false
    })
  }
})
