// pages/team/home.js
// 球队主页
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    teamId: '',
    team: {},
    myOpenid: '',
    myRole: null, // null=非成员, 'creator', 'admin', 'member'
    tabs: ['活动', '成员', '散客', '申请'],
    activeTab: '活动',
    members: [],
    activities: [],
    casuals: [],
    selectedCasuals: [],
    applications: [],
    loadingMembers: false,
    loadingActivities: false,
    loadingCasuals: false,
    loadingApplications: false,
    hasPendingApplication: false, // 非成员：是否有待审批的申请
    // 注册弹窗
    showRegisterModal: false
  },

  // 待执行的加入操作（注册完成后执行）
  _pendingJoin: null,

  // 缓存加载状态（避免重复加载）
  _cacheTimestamps: {
    members: 0,
    activities: 0,
    casuals: 0,
    applications: 0
  },
  _cacheValidDuration: 30000, // 30秒缓存有效期

  onLoad(options) {
    const teamId = options.teamId
    if (!teamId) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      wx.navigateBack()
      return
    }
    this.setData({ teamId })
    this.loadTeamInfo()
    this.loadActivities()
  },

  onShow() {
    // 每次显示页面时检查申请状态（非成员时）
    if (this.data.myRole === null && this.data.teamId) {
      this.checkPendingApplication()
    }
  },

  // ========== 检查是否有待审批的申请 ==========
  async checkPendingApplication() {
    const openid = app.globalData.openid || wx.getStorageSync('openid')
    if (!openid) return

    try {
      const res = await db.collection('team_applications')
        .where({ teamId: this.data.teamId, openid, status: 'pending' })
        .get()

      const hasPending = res.data && res.data.length > 0
      if (this.data.hasPendingApplication !== hasPending) {
        this.setData({ hasPendingApplication: hasPending })
      }
    } catch (e) {
      console.error('checkPendingApplication error', e)
    }
  },

  async loadTeamInfo() {
    const openid = app.globalData.openid || wx.getStorageSync('openid')
    this.setData({ myOpenid: openid })

    try {
      const res = await wx.cloud.callFunction({
        name: 'getMyTeams'
      })

      if (res.result.success) {
        const allTeams = [...res.result.createdTeams, ...res.result.joinedTeams]
        const team = allTeams.find(t => t._id === this.data.teamId)

        if (team) {
          // 已是成员
          const displayLogo = team.logoPath ? app.getDisplayAvatar({ cloudPath: team.logoPath }) : ''
          const displayCover = team.coverPath ? app.getDisplayAvatar({ cloudPath: team.coverPath }) : ''
          this.setData({ team, myRole: team.myRole, displayLogo, displayCover, hasPendingApplication: false })
        } else {
          // 非成员，从云端直接拉取球队信息
          const cloudTeam = await db.collection('teams').doc(this.data.teamId).get()
          if (cloudTeam.data) {
            const displayLogo = cloudTeam.data.logoPath ? app.getDisplayAvatar({ cloudPath: cloudTeam.data.logoPath }) : ''
            const displayCover = cloudTeam.data.coverPath ? app.getDisplayAvatar({ cloudPath: cloudTeam.data.coverPath }) : ''
            this.setData({ team: cloudTeam.data, myRole: null, displayLogo, displayCover })
            // 检查是否有待审批的申请
            this.checkPendingApplication()
            // 如果是 qrcode 模式，自动加入
            if (cloudTeam.data.joinMethod === 'qrcode') {
              this.autoJoinTeam()
            }
          }
        }
      }
    } catch (e) {
      console.error('loadTeamInfo error', e)
    }
  },

  // ========== 自动加入球队（qrcode 模式）==========
  async autoJoinTeam() {
    const { teamId, team } = this.data
    if (!teamId || !team) return

    wx.showLoading({ title: '加入中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'joinTeam',
        data: { teamId }
      })
      wx.hideLoading()
      if (res.result.success && res.result.type === 'direct') {
        wx.showToast({ title: '加入成功', icon: 'success' })
        // 重新加载球队信息
        this.loadTeamInfo()
        this.loadMembers()
      }
    } catch (e) {
      wx.hideLoading()
      console.error('autoJoinTeam error', e)
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    if (tab === '成员') this.loadMembers()
    if (tab === '活动') this.loadActivities()
    if (tab === '散客') this.loadCasuals()
    if (tab === '申请') this.loadApplications()
  },

  // ========== 成员列表 ==========
  async loadMembers(force = false) {
    // 缓存检查：30秒内不重复加载
    if (!force && Date.now() - this._cacheTimestamps.members < this._cacheValidDuration && this.data.members.length > 0) {
      return
    }
    this.setData({ loadingMembers: true })
    try {
      const res = await db.collection('team_members')
        .where({ teamId: this.data.teamId })
        .get()

      const openids = res.data.map(m => m.openid)
      const usersMap = await app.fetchUsersWithCache(openids)

      const members = res.data.map(m => {
        const user = usersMap[m.openid] || {}
        const roleTextMap = { creator: '👑 创建者', admin: '⚡ 管理员', member: '队员' }
        const roleClassMap = { creator: 'role-creator', admin: 'role-admin', member: 'role-member' }
        return {
          ...m,
          ...user,
          roleText: roleTextMap[m.role] || m.role,
          roleClass: roleClassMap[m.role] || '',
          displayAvatar: app.getDisplayAvatar(user)
        }
      })

      // 创建者排第一
      members.sort((a, b) => {
        const order = { creator: 0, admin: 1, member: 2 }
        return order[a.role] - order[b.role]
      })

      this.setData({ members, loadingMembers: false })
      this._cacheTimestamps.members = Date.now()
    } catch (e) {
      console.error('loadMembers error', e)
      this.setData({ loadingMembers: false })
    }
  },

  // ========== 活动列表 ==========
  async loadActivities(force = false) {
    // 缓存检查：30秒内不重复加载
    if (!force && Date.now() - this._cacheTimestamps.activities < this._cacheValidDuration && this.data.activities.length > 0) {
      return
    }
    this.setData({ loadingActivities: true })
    try {
      const res = await db.collection('activities')
        .where({ teamId: this.data.teamId })
        .orderBy('activityDate', 'desc')
        .limit(20)
        .get()

      const now = new Date()
      const activities = res.data.map(act => {
        const actDate = act.activityDate instanceof Date ? act.activityDate : new Date(act.activityDate)
        const effectiveStatus = actDate < now ? 'finished' : act.status

        const statusMap = {
          open: { text: '报名中', cls: 'tag-green' },
          ongoing: { text: '进行中', cls: 'tag-blue' },
          finished: { text: '已结束', cls: 'tag-gray' },
          cancelled: { text: '已取消', cls: 'tag-red' }
        }

        const confirmed = (act.registrations || []).filter(r => r.status === 'confirmed')
        const confirmedCount = confirmed.length
        const maxPlayers = act.maxPlayers || 999
        const progressPercent = maxPlayers === 999 ? 0 : Math.min((confirmedCount / maxPlayers) * 100, 100)

        return {
          ...act,
          displayDate: `${actDate.getMonth() + 1}月${actDate.getDate()}日`,
          time: act.startTime || '',
          statusText: statusMap[effectiveStatus]?.text || act.status,
          statusClass: statusMap[effectiveStatus]?.cls || '',
          confirmedCount,
          progressPercent
        }
      })

      this.setData({ activities, loadingActivities: false })
      this._cacheTimestamps.activities = Date.now()
    } catch (e) {
      console.error('loadActivities error', e)
      this.setData({ loadingActivities: false })
    }
  },

  // ========== 散客列表 ==========
  async loadCasuals(force = false) {
    // 缓存检查：30秒内不重复加载
    if (!force && Date.now() - this._cacheTimestamps.casuals < this._cacheValidDuration && this.data.casuals.length > 0) {
      return
    }
    this.setData({ loadingCasuals: true })
    try {
      // 查询散客和成员列表（并行）
      const [casualsRes, membersRes] = await Promise.all([
        db.collection('team_casuals')
          .where({ teamId: this.data.teamId })
          .orderBy('activityCount', 'desc')
          .get(),
        db.collection('team_members')
          .where({ teamId: this.data.teamId })
          .field({ openid: true })
          .get()
      ])

      // 获取成员 openid 集合，用于排除已是成员的用户
      const memberOpenids = {}
      ;(membersRes.data || []).forEach(function(m) { memberOpenids[m.openid] = true })

      // 过滤掉已经是球队成员的用户
      const validCasuals = (casualsRes.data || []).filter(function(c) { return !memberOpenids[c.openid] })

      const openids = validCasuals.map(function(c) { return c.openid })
      const usersMap = await app.fetchUsersWithCache(openids)

      const casuals = validCasuals.map(function(c) {
        const user = usersMap[c.openid] || {}
        return {
          ...c,
          ...user,
          displayAvatar: app.getDisplayAvatar(user)
        }
      })

      this.setData({ casuals, loadingCasuals: false })
      this._cacheTimestamps.casuals = Date.now()
    } catch (e) {
      console.error('loadCasuals error', e)
      this.setData({ loadingCasuals: false })
    }
  },

  // ========== 散客选择 ==========
  toggleSelectAll() {
    const { selectedCasuals, casuals } = this.data
    if (selectedCasuals.length === casuals.length) {
      this.setData({ selectedCasuals: [] })
    } else {
      this.setData({ selectedCasuals: casuals.map(c => c.openid) })
    }
  },

  toggleCasual(e) {
    const openid = e.currentTarget.dataset.openid
    const { selectedCasuals } = this.data
    const idx = selectedCasuals.indexOf(openid)
    if (idx >= 0) {
      selectedCasuals.splice(idx, 1)
    } else {
      selectedCasuals.push(openid)
    }
    this.setData({ selectedCasuals: [...selectedCasuals] })
  },

  async convertCasuals() {
    const { selectedCasuals, teamId } = this.data
    if (selectedCasuals.length === 0) {
      wx.showToast({ title: '请先选择散客', icon: 'none' })
      return
    }

    wx.showModal({
      title: '确认转入',
      content: `确定将 ${selectedCasuals.length} 位散客转为正式队员？`,
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '转入中...' })
        try {
          const result = await wx.cloud.callFunction({
            name: 'updateTeamMember',
            data: { teamId, action: 'convertCasuals', casualOpenids: selectedCasuals }
          })
          wx.hideLoading()
          if (result.result.success) {
            wx.showToast({ title: result.result.message, icon: 'success' })
            this.setData({ selectedCasuals: [] })
            this.loadCasuals()
            this.loadMembers()
          } else {
            wx.showToast({ title: result.result.message || '转入失败', icon: 'none' })
          }
        } catch (e) {
          wx.hideLoading()
          wx.showToast({ title: '转入失败', icon: 'none' })
        }
      }
    })
  },

  // ========== 申请审批 ==========
  async loadApplications() {
    const { teamId } = this.data
    this.setData({ loadingApplications: true, applications: [] })
    try {
      const res = await wx.cloud.callFunction({
        name: 'getTeamApplications',
        data: { teamId }
      })
      if (res.result && res.result.applications) {
        const openids = res.result.applications.map(a => a.openid)
        const usersMap = await app.fetchUsersWithCache(openids)
        const applications = res.result.applications.map(a => {
          const user = usersMap[a.openid] || {}
          return {
            ...a,
            nickName: user.nickName || '未知用户',
            displayAvatar: app.getDisplayAvatar(user),
            appliedAtText: formatTime(a.appliedAt)
          }
        })
        this.setData({ applications })
      }
    } catch (e) {
      console.error('[team] loadApplications error:', e)
    } finally {
      this.setData({ loadingApplications: false })
    }
  },

  async handleApplication(e) {
    const { teamId } = this.data
    const targetOpenid = e.currentTarget.dataset.openid
    const action = e.currentTarget.dataset.action

    console.log('[handleApplication] 触发, teamId:', teamId, 'targetOpenid:', targetOpenid, 'action:', action)

    if (!teamId || !targetOpenid || !action) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      console.error('[handleApplication] 参数缺失:', { teamId, targetOpenid, action })
      return
    }

    const confirmText = action === 'approve' ? '通过' : '拒绝'
    wx.showModal({
      title: `确认${confirmText}`,
      content: action === 'approve' ? '确定通过该申请？用户将直接加入球队' : '确定拒绝该申请？用户可以重新申请',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '处理中...' })
        try {
          console.log('[handleApplication] 调用云函数, data:', { teamId, targetOpenid, action })
          const result = await wx.cloud.callFunction({
            name: 'handleTeamApplication',
            data: { teamId, targetOpenid, action }
          })
          wx.hideLoading()
          console.log('[handleApplication] 云函数返回:', result.result)
          if (result.result.success) {
            wx.showToast({ title: action === 'approve' ? '已通过' : '已拒绝', icon: 'success' })
            this.loadApplications()
            if (action === 'approve') {
              this.loadMembers()
            }
          } else {
            wx.showToast({ title: result.result.message || '操作失败', icon: 'none' })
          }
        } catch (e) {
          wx.hideLoading()
          console.error('[handleApplication] 调用异常:', e)
          wx.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    })
  },

  // ========== 成员操作 ==========
  async toggleAdmin(e) {
    const { teamId } = this.data
    const targetOpenid = e.currentTarget.dataset.openid
    try {
      const res = await wx.cloud.callFunction({
        name: 'updateTeamMember',
        data: { teamId, action: 'setAdmin', targetOpenid }
      })
      if (res.result.success) {
        wx.showToast({ title: res.result.message, icon: 'success' })
        this.loadMembers(true) // 强制刷新
      } else {
        wx.showToast({ title: res.result.message, icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  async removeMember(e) {
    const { teamId } = this.data
    const targetOpenid = e.currentTarget.dataset.openid
    wx.showModal({
      title: '确认移除',
      content: '确定将该成员移除出球队？',
      success: async (res) => {
        if (!res.confirm) return
        try {
          const result = await wx.cloud.callFunction({
            name: 'updateTeamMember',
            data: { teamId, action: 'removeMember', targetOpenid }
          })
          if (result.result.success) {
            wx.showToast({ title: '已移除', icon: 'success' })
            this.loadMembers(true) // 强制刷新
          } else {
            wx.showToast({ title: result.result.message, icon: 'none' })
          }
        } catch (e) {
          wx.showToast({ title: '移除失败', icon: 'none' })
        }
      }
    })
  },

  // ========== 注册相关 ==========
  // 注册完成回调
  onRegistered() {
    this.setData({ showRegisterModal: false })
    this.loadTeamInfo()
    // 注册完成后执行之前被拦截的操作
    if (this._pendingJoin) {
      const action = this._pendingJoin
      this._pendingJoin = null
      // 延迟执行，确保数据已刷新
      setTimeout(() => {
        if (action === 'apply') {
          this.doApplyConfirm()
        } else {
          this._doJoin()
        }
      }, 300)
    }
  },

  // 关闭注册弹窗
  onCloseRegister() {
    this.setData({ showRegisterModal: false })
    this._pendingJoin = null
  },

  // 检查注册状态，未注册则弹窗
  checkRegisterBeforeJoin(action) {
    if (!app.isUserRegistered()) {
      this._pendingJoin = action
      this.setData({ showRegisterModal: true })
      return false
    }
    return true
  },

  // ========== 加入球队 ==========
  async joinTeam() {
    const { team, joinMethod } = this.data.team ? { team: this.data.team, joinMethod: this.data.team.joinMethod || 'qrcode' } : { team: this.data.team, joinMethod: 'qrcode' }

    if (joinMethod === 'apply') {
      // 检查注册状态
      if (!this.checkRegisterBeforeJoin('apply')) {
        return
      }
      this.doApplyConfirm()
    } else {
      // 检查注册状态
      if (!this.checkRegisterBeforeJoin('direct')) {
        return
      }
      await this._doJoin()
    }
  },

  // 申请确认弹窗
  doApplyConfirm() {
    const { team } = this.data
    wx.showModal({
      title: '申请加入',
      content: `确定要申请加入「${team.name}」吗？申请提交后需等待管理员审批。`,
      confirmText: '提交申请',
      success: async (res) => {
        if (!res.confirm) return
        await this._doJoin()
      }
    })
  },

  async _doJoin() {
    const { teamId } = this.data
    wx.showLoading({ title: '加入中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'joinTeam',
        data: { teamId }
      })
      wx.hideLoading()
      if (res.result.success) {
        if (res.result.type === 'direct') {
          wx.showToast({ title: '加入成功', icon: 'success' })
          this.loadTeamInfo()
          this.loadMembers()
        } else {
          // 申请模式：更新申请状态
          wx.showToast({ title: '申请已提交，请等待审批', icon: 'success' })
          this.setData({ hasPendingApplication: true })
          this.loadTeamInfo()
        }
      } else {
        wx.showToast({ title: res.result.message, icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '加入失败', icon: 'none' })
    }
  },

  // ========== 申请列表 ==========
  async loadApplications(force = false) {
    // 缓存检查：30秒内不重复加载
    if (!force && Date.now() - this._cacheTimestamps.applications < this._cacheValidDuration && this.data.applications.length > 0) {
      return
    }
    this.setData({ loadingApplications: true })
    try {
      const res = await db.collection('team_applications')
        .where({ teamId: this.data.teamId, status: 'pending' })
        .orderBy('appliedAt', 'asc')
        .get()

      const openids = res.data.map(a => a.openid)
      const usersMap = await app.fetchUsersWithCache(openids)

      const applications = res.data.map(a => {
        const user = usersMap[a.openid] || {}
        return {
          ...a,
          ...user,
          displayAvatar: app.getDisplayAvatar(user),
          appliedAtText: new Date(a.appliedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
        }
      })

      this.setData({ applications, loadingApplications: false })
      this._cacheTimestamps.applications = Date.now()
    } catch (e) {
      console.error('loadApplications error', e)
      this.setData({ loadingApplications: false })
    }
  },

  // ========== 分享邀请 ==========
  shareTeam() {
    const { team } = this.data
    // 微信小程序只能通过右上角"..."菜单分享
    // 先开启分享菜单，然后提示用户
    try {
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage', 'shareTimeline']
      })
    } catch (e) {}
    // 提示用户通过右上角分享
    wx.showToast({
      title: '点击右上角"···"分享',
      icon: 'none',
      duration: 2000
    })
  },

  onShareAppMessage() {
    const { teamId, team, displayLogo } = this.data
    return {
      title: `加入「${team.name}」，一起踢球！`,
      path: `/pages/team/home?teamId=${teamId}`,
      imageUrl: displayLogo || ''
    }
  },

  // ========== 发布活动 ==========
  publishActivity() {
    const { teamId, team } = this.data
    const url = `/pages/activity/create?teamId=${teamId}&teamName=${encodeURIComponent(team.name)}`
    wx.navigateTo({ url })
  },

  // ========== 球队设置 ==========
  goSettings() {
    const { teamId } = this.data
    wx.navigateTo({
      url: `/pages/team/settings?teamId=${teamId}`
    })
  },

  // ========== 跳转活动详情 ==========
  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/activity/detail?id=${id}` })
  }
})
