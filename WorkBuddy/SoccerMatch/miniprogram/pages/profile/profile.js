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
    placeholderAvatar: '/images/default-avatar.png',
    positions: [
      { value: 'ALL', label: '全能 ALL', emoji: '⭐' },
      { value: 'GK', label: '守门员 GK', emoji: '🧤' },
      { value: 'LB', label: '左后卫 LB', emoji: '↩' },
      { value: 'CB', label: '中后卫 CB', emoji: '🛡' },
      { value: 'RB', label: '右后卫 RB', emoji: '↪' },
      { value: 'LWB', label: '左翼卫 LWB', emoji: '⚡' },
      { value: 'RWB', label: '右翼卫 RWB', emoji: '⚡' },
      { value: 'CDM', label: '后腰 CDM', emoji: '🛡' },
      { value: 'CM', label: '中场 CM', emoji: '⚙' },
      { value: 'LM', label: '左中场 LM', emoji: '⚡' },
      { value: 'RM', label: '右中场 RM', emoji: '⚡' },
      { value: 'CAM', label: '前腰 CAM', emoji: '🎯' },
      { value: 'LW', label: '左边锋 LW', emoji: '⚡' },
      { value: 'RW', label: '右边锋 RW', emoji: '⚡' },
      { value: 'ST', label: '中锋 ST', emoji: '🎯' },
      { value: 'CF', label: '前锋 CF', emoji: '🎯' }
    ],
    myStats: {
      totalGames: 0,
      confirmedCount: 0,
      pendingCount: 0,
      leaveCount: 0
    },
    history: [],
    version: '3.0.0',
    templateCount: 0,
    // 注册弹窗
    showRegisterModal: false,
    // 球队数据
    myTeams: [],
    displayTeams: [],
    createdTeams: [],
    joinedTeams: [],
    loadingTeams: true,
    showAllTeams: false
  },

  onLoad() {
    this.loadUserInfo()
    // 获取小程序版本号
    const accountInfo = wx.getAccountInfoSync()
    const version = accountInfo.miniProgram.version || '2.1.0'
    this.setData({ version })
  },

  onShow() {
    // 智能加载：优先显示本地缓存（秒开）
    this.loadUserInfo()

    // 加载历史记录（本地缓存优先）
    this.loadHistory(true)

    // 同步 TabBar 选中状态（个人中心索引为 1）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }

    // 加载我的球队
    this.loadMyTeams()

    // 加载模板数量
    const templates = app.loadTemplates()
    this.setData({ templateCount: templates.length })
  },

  // ========== 球队相关 ==========
  async loadMyTeams() {
    if (!app.isUserRegistered()) {
      return
    }
    this.setData({ loadingTeams: true, showAllTeams: false })
    try {
      const res = await wx.cloud.callFunction({ name: 'getMyTeams' })
      if (res.result.success) {
        const roleTextMap = { creator: '创建者', admin: '管理员', member: '成员' }
        const createdTeams = (res.result.createdTeams || []).map(t => ({
          ...t, myRoleText: roleTextMap[t.myRole] || t.myRole, _sortTime: t.createdAt || 0
        }))
        const joinedTeams = (res.result.joinedTeams || []).map(t => ({
          ...t, myRoleText: roleTextMap[t.myRole] || t.myRole, _sortTime: t.joinedAt || 0
        }))
        const myTeams = [...createdTeams, ...joinedTeams].sort((a, b) => b._sortTime - a._sortTime)
        const displayTeams = this.data.showAllTeams ? myTeams : myTeams.slice(0, 5)
        console.log('[profile] 处理后的 myTeams:', myTeams)
        console.log('[profile] displayTeams:', displayTeams)
        this.setData({
          myTeams,
          displayTeams,
          loadingTeams: false
        })
      } else {
        console.error('[profile] getMyTeams 返回失败:', res.result.error)
        this.setData({ loadingTeams: false })
      }
    } catch (e) {
      console.error('[profile] loadMyTeams 异常:', e)
      this.setData({ loadingTeams: false })
    }
  },

  goTeamHome(e) {
    const teamId = e.currentTarget.dataset.teamid
    wx.navigateTo({ url: `/pages/team/home?teamId=${teamId}` })
  },

  goCreateTeam() {
    wx.navigateTo({ url: '/pages/team/create' })
  },

  toggleShowAllTeams() {
    const newShowAll = !this.data.showAllTeams
    const displayTeams = newShowAll ? this.data.myTeams : this.data.myTeams.slice(0, 5)
    this.setData({ showAllTeams: newShowAll, displayTeams })
  },

  // 注册完成回调
  onRegistered() {
    this.setData({ showRegisterModal: false })
    this.loadUserInfo()
    this.loadHistory(true)
    this.loadMyTeams()
    // 注册完成后执行之前被拦截的操作
    if (this._pendingAction === 'editProfile') {
      this._pendingAction = null
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/profile/edit-profile/edit-profile' })
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

  async loadUserInfo() {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || {}
    const openid = app.globalData.openid || wx.getStorageSync('openid') || ''
    const shortOpenid = openid ? openid.slice(-6).toUpperCase() : '------'
    
    // 确保 positions 是数组
    if (!userInfo.positions) {
      userInfo.positions = []
    }
    
    // 处理头像：优先用预解析的 displayAvatar，其次 cloudPath，微信自动处理 cloud:// 转换
    userInfo.displayAvatar = app.getDisplayAvatar(userInfo)
    
    // 处理位置数据，添加选中状态和选择顺序
    // 兼容旧格式（字符串数组）和新格式（对象数组）
    const positions = this.data.positions.map(pos => {
      const selectedItem = userInfo.positions.find(p => 
        typeof p === 'string' ? p === pos.value : p.value === pos.value
      )
      return {
        ...pos,
        isSelected: !!selectedItem,
        selectOrder: selectedItem ? (typeof selectedItem === 'string' ? 1 : selectedItem.order) : 0
      }
    })
    
    this.setData({ userInfo, shortOpenid, positions })
  },

  // ==================== 头像选择 ====================
  
  // 显示头像选项弹窗
  showAvatarOptions() {
    // 先显示弹窗
    this.setData({ showAvatarSheet: true })
    
    // 尝试获取微信用户信息
    this.fetchWechatUserInfo()
  },

  // 获取微信用户信息（从已保存的用户信息中获取，不调用废弃的 API）
  fetchWechatUserInfo() {
    // 从全局数据或本地存储获取已保存的用户信息
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || {}
    
    // 将用户信息保存到 wechatUserInfo
    this.setData({ wechatUserInfo: userInfo })
  },

  // 关闭头像选项弹窗
  closeAvatarSheet() {
    this.setData({ showAvatarSheet: false })
  },

  // 使用微信头像
  chooseWechatAvatar(e) {
    const { avatarUrl } = e.detail
    if (!avatarUrl) return

    wx.showLoading({ title: '上传中...' })
    app.uploadAvatar(avatarUrl).then(cloudPath => {
      const userInfo = { ...this.data.userInfo, cloudPath }
      this.saveUserInfo(userInfo)
      this.closeAvatarSheet()
      wx.showToast({ title: '头像更新成功', icon: 'success' })
    }).catch(() => {
      wx.showToast({ title: '上传失败，请重试', icon: 'none' })
    }).finally(() => {
      wx.hideLoading()
    })
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
          const cloudPath = await app.uploadAvatar(tempPath)
          const userInfo = { ...this.data.userInfo, cloudPath }
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
    
    // 尝试获取微信用户信息
    this.fetchWechatUserInfo()
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

  // 清空位置偏好
  clearPositions() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有位置偏好吗？',
      success: (res) => {
        if (res.confirm) {
          const userInfo = { ...this.data.userInfo, positions: [] }
          
          // 重置所有位置选中状态
          const positions = this.data.positions.map(p => ({
            ...p,
            isSelected: false,
            selectOrder: 0
          }))
          
          this.setData({ userInfo, positions })
          this.saveUserInfo(userInfo)
          wx.showToast({ title: '已清空', icon: 'success' })
        }
      }
    })
  },

  // 选择位置（多选，按选择顺序排序，参考微信图片选择逻辑）
  selectPosition(e) {
    // 注册检查：未注册用户先引导注册
    if (!this.checkRegisterBeforeAction('selectPosition')) return

    const pos = e.currentTarget.dataset.pos
    const currentPositions = this.data.userInfo.positions || []
    
    let newPositions
    // 检查是否已选中（支持新旧两种数据格式）
    const isSelected = currentPositions.some(p => 
      typeof p === 'string' ? p === pos : p.value === pos
    )
    
    if (isSelected) {
      // 已选中，取消选择
      newPositions = currentPositions.filter(p => 
        typeof p === 'string' ? p !== pos : p.value !== pos
      )
      // 重新计算剩余位置的 order（保持连续的 1、2、3）
      newPositions = newPositions.map((p, index) => ({
        ...p,
        order: index + 1,
        label: index === 0 ? '首' : '备'
      }))
    } else {
      // 未选中，添加到末尾（选择顺序）
      // 最多选择3个位置
      if (currentPositions.length >= 3) {
        wx.showToast({ title: '最多选择3个位置', icon: 'none' })
        return
      }
      // 新格式：存储对象，包含顺序信息
      const order = currentPositions.length + 1
      newPositions = [...currentPositions, {
        value: pos,
        order: order,
        label: order === 1 ? '首' : '备'
      }]
    }
    
    const userInfo = { ...this.data.userInfo, positions: newPositions }
    
    // 更新位置选中状态和选择顺序
    const positions = this.data.positions.map(p => {
      const selectedItem = newPositions.find(item => 
        typeof item === 'string' ? item === p.value : item.value === p.value
      )
      return {
        ...p,
        isSelected: !!selectedItem,
        selectOrder: selectedItem ? (typeof selectedItem === 'string' ? 1 : selectedItem.order) : 0
      }
    })
    
    this.setData({ userInfo, positions })
    this.saveUserInfo(userInfo)
    // 不显示气泡提醒，只通过高亮和角标反馈
  },

  async saveUserInfo(userInfo) {
    // 1. 立即更新全局数据和本地存储（确保本地永远是最新的）
    app.globalData.userInfo = userInfo
    wx.setStorageSync('userInfo', userInfo)
    this.setData({ userInfo })

    const openid = app.globalData.openid || wx.getStorageSync('openid')
    if (!openid) return

    // 2. 同步更新所有已报名活动中的位置信息
    this.updateActivityPositions(userInfo.positions)

    // 3. 异步同步到云数据库 - 使用 merge: true
    // merge: 不存在则创建，存在则只合并指定字段，不会覆盖其他字段
    const db = wx.cloud.database()
    const userData = {
      openid: openid,
      nickName: userInfo.nickName || '',
      cloudPath: userInfo.cloudPath || '',
      positions: userInfo.positions || [],
      updatedAt: db.serverDate()
    }
    
    try {
      await db.collection('users').doc(openid).set({
        data: userData,
        merge: true
      })
    } catch (err) {
      console.error('[saveUserInfo] 云端同步失败', err)
    }
  },

  // 更新所有已报名活动中的位置信息
  async updateActivityPositions(positions) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'updateUserPosition',
        data: { positions }
      })
      if (res.result.success) {
        // 更新成功
      } else {
        console.error('[updateActivityPositions] 更新失败:', res.result.error)
      }
    } catch (err) {
      console.error('[updateActivityPositions] 调用失败:', err)
    }
  },

  // 加载历史记录（只加载全部用于统计，显示前5条）
  async loadHistory(useCache = false) {
    const openid = app.globalData.openid || wx.getStorageSync('openid')
    if (!openid) return

    // 本地缓存优先
    if (useCache) {
      const cachedHistory = wx.getStorageSync('myHistory')
      const cachedStats = wx.getStorageSync('myStats')
      if (cachedHistory && cachedStats) {
        this.setData({
          history: cachedHistory,
          historyTotal: cachedHistory.length,
          hasMoreHistory: cachedHistory.length > 5,
          myStats: cachedStats
        })
      }
    }

    // 后台静默更新（不阻塞界面）
    this.syncHistory(openid)
  },

  // 后台同步历史数据（服务端过滤，避免全量拉取）
  async syncHistory(openid) {
    try {
      // 并行执行：统计数据聚合查询 + 前5条历史记录
      const [statsRes, historyRes] = await Promise.all([
        // 聚合查询统计数据
        db.collection('activities')
          .aggregate()
          .match({ 'registrations.openid': openid })
          .project({
            myRegs: db.command.aggregate.filter({
              input: '$registrations',
              as: 'r',
              cond: db.command.aggregate.eq(['$$r.openid', openid])
            })
          })
          .project({
            myStatus: db.command.aggregate.arrayElemAt(['$myRegs', 0])
          })
          .project({ status: '$myStatus.status' })
          .end(),
        // 查询最近5条参与记录
        db.collection('activities')
          .where({ 'registrations.openid': openid })
          .orderBy('activityDate', 'desc')
          .limit(5)
          .get()
      ])

      // 计算统计
      const records = statsRes.list || []
      let totalGames = 0, confirmedCount = 0, pendingCount = 0, leaveCount = 0
      records.forEach(r => {
        if (r.status === 'confirmed') { confirmedCount++; totalGames++ }
        else if (r.status === 'pending') pendingCount++
        else if (r.status === 'leave') leaveCount++
      })

      // 处理前5条历史记录
      const statusMap = {
        confirmed: { text: '✅ 报名', cls: 'tag-green' },
        pending: { text: '⏳ 待定', cls: 'tag-yellow' },
        leave: { text: '🙅 请假', cls: 'tag-red' }
      }

      const allHistory = historyRes.data.map(act => {
        const myReg = (act.registrations || []).find(r => r.openid === openid)
        const actDate = act.activityDate instanceof Date ? act.activityDate : new Date(act.activityDate)
        return {
          ...act,
          myStatus: myReg?.status,
          myStatusText: statusMap[myReg?.status]?.text || '',
          myStatusClass: statusMap[myReg?.status]?.cls || '',
          displayDate: this.formatDate(actDate)
        }
      })

      const displayHistory = allHistory.slice(0, 5)
      const hasMore = historyRes.data.length === 5

      const newStats = { totalGames, confirmedCount, pendingCount, leaveCount }

      // 保存到缓存
      wx.setStorageSync('myHistory', displayHistory)
      wx.setStorageSync('myStats', newStats)

      // 数据有变化才更新界面
      const currentStats = this.data.myStats
      if (currentStats.totalGames !== newStats.totalGames ||
          currentStats.confirmedCount !== newStats.confirmedCount ||
          currentStats.pendingCount !== newStats.pendingCount ||
          currentStats.leaveCount !== newStats.leaveCount) {
        this.setData({
          history: displayHistory,
          historyTotal: records.length,
          hasMoreHistory: hasMore,
          myStats: newStats
        })
      }
    } catch (e) {
      console.error('同步历史失败', e)
    }
  },

  // 跳转到历史列表页
  goHistoryList() {
    wx.navigateTo({
      url: '/pages/profile/history'
    })
  },

  // 跳转到隐私保护指引
  goPrivacy() {
    wx.navigateTo({
      url: '/pages/privacy/privacy'
    })
  },

  // 跳转到我的模板
  goTemplates() {
    wx.navigateTo({ url: '/pages/profile/templates/templates' })
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
      title: `来踢球 v${version}`,
      content: '⚽ 专为足球队设计的足球活动报名小程序\n功能：活动报名、战术板、队员管理\n\n有建议欢迎联系管理员',
      showCancel: false
    })
  },

  // 跳转到编辑页面
  goEditProfile() {
    // 注册检查：未注册用户先引导注册
    if (!this.checkRegisterBeforeAction('editProfile')) return

    wx.navigateTo({
      url: '/pages/profile/edit-profile/edit-profile'
    })
  }
})
