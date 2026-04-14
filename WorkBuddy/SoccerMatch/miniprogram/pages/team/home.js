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
    loadingApplications: false
  },

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
          const displayLogo = team.logoPath ? app.getDisplayAvatar({ cloudPath: team.logoPath }) : ''
          const displayCover = team.coverPath ? app.getDisplayAvatar({ cloudPath: team.coverPath }) : ''
          this.setData({ team, myRole: team.myRole, displayLogo, displayCover })
        } else {
          // 非成员，从云端直接拉取球队信息
          const cloudTeam = await db.collection('teams').doc(this.data.teamId).get()
          if (cloudTeam.data) {
            const displayLogo = cloudTeam.data.logoPath ? app.getDisplayAvatar({ cloudPath: cloudTeam.data.logoPath }) : ''
            const displayCover = cloudTeam.data.coverPath ? app.getDisplayAvatar({ cloudPath: cloudTeam.data.coverPath }) : ''
            this.setData({ team: cloudTeam.data, myRole: null, displayLogo, displayCover })
          }
        }
      }
    } catch (e) {
      console.error('loadTeamInfo error', e)
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
  async loadMembers() {
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
    } catch (e) {
      console.error('loadMembers error', e)
      this.setData({ loadingMembers: false })
    }
  },

  // ========== 活动列表 ==========
  async loadActivities() {
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
    } catch (e) {
      console.error('loadActivities error', e)
      this.setData({ loadingActivities: false })
    }
  },

  // ========== 散客列表 ==========
  async loadCasuals() {
    this.setData({ loadingCasuals: true })
    try {
      const res = await db.collection('team_casuals')
        .where({ teamId: this.data.teamId })
        .orderBy('activityCount', 'desc')
        .get()

      const openids = res.data.map(c => c.openid)
      const usersMap = await app.fetchUsersWithCache(openids)

      const casuals = res.data.map(c => {
        const user = usersMap[c.openid] || {}
        return {
          ...c,
          ...user,
          displayAvatar: app.getDisplayAvatar(user)
        }
      })

      this.setData({ casuals, loadingCasuals: false })
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
        this.loadMembers()
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
            this.loadMembers()
          } else {
            wx.showToast({ title: result.result.message, icon: 'none' })
          }
        } catch (e) {
          wx.showToast({ title: '移除失败', icon: 'none' })
        }
      }
    })
  },

  // ========== 加入球队 ==========
  async joinTeam() {
    const { teamId, team } = this.data
    const joinMethod = team.joinMethod || 'qrcode'

    if (joinMethod === 'apply') {
      wx.showModal({
        title: '申请加入',
        content: `确定要申请加入「${team.name}」吗？申请提交后需等待管理员审批。`,
        confirmText: '提交申请',
        success: async (res) => {
          if (!res.confirm) return
          await this._doJoin()
        }
      })
    } else {
      await this._doJoin()
    }
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
        } else {
          wx.showToast({ title: '申请已提交，请等待审批', icon: 'success' })
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
  async loadApplications() {
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
    } catch (e) {
      console.error('loadApplications error', e)
      this.setData({ loadingApplications: false })
    }
  },

  // ========== 审批申请 ==========
  async handleApplication(e) {
    const { openid, action } = e.currentTarget.dataset
    const { teamId } = this.data
    const label = action === 'approve' ? '通过' : '拒绝'

    wx.showModal({
      title: `确认${label}`,
      content: action === 'approve' ? '确定让该用户加入球队？' : '确定拒绝该申请？',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '处理中...' })
        try {
          const result = await wx.cloud.callFunction({
            name: 'handleTeamApplication',
            data: { teamId, targetOpenid: openid, action }
          })
          wx.hideLoading()
          if (result.result.success) {
            wx.showToast({ title: action === 'approve' ? '已通过' : '已拒绝', icon: 'success' })
            this.loadApplications()
            this.loadMembers()
          } else {
            wx.showToast({ title: result.result.message || '操作失败', icon: 'none' })
          }
        } catch (e) {
          wx.hideLoading()
          wx.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    })
  },

  // ========== 分享邀请 ==========
  shareTeam() {
    const { teamId, team } = this.data
    wx.showModal({
      title: '邀请加入',
      content: `分享「${team.name}」给朋友，他们可以扫码或点击链接加入球队`,
      confirmText: '分享',
      success: async (res) => {
        if (res.confirm) {
          try {
            // 生成分享信息
            wx.showShareMenu({
              withShareTicket: true,
              menus: ['shareAppMessage', 'shareTimeline']
            })
          } catch (e) {}
          // 实际分享由微信自动处理
          this.setData({ shareReady: true })
        }
      }
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
    const { teamId } = this.data
    wx.navigateTo({
      url: `/pages/activity/create?teamId=${teamId}`
    })
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
