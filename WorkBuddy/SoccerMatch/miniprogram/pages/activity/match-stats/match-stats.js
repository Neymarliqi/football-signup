// pages/activity/match-stats/match-stats.js
// 数据详情/录入页面
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    activityId: '',
    activity: {},
    // 比赛数据
    goals: 0,
    opponentGoals: 0,
    opponentName: '',    // 对手名称
    result: '',            // 'win'/'draw'/'lose'
    players: [],           // { openid, nickName, displayAvatar, type, attended, goals, assists }
    hasStats: false,
    // 权限
    canEdit: false,
    // 视图模式：'view' | 'edit'
    mode: 'view',
    loading: true,
    saving: false
  },

  onLoad(options) {
    const activityId = options.activityId
    const mode = options.mode || 'view'
    if (!activityId) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      wx.navigateBack()
      return
    }
    this.setData({ activityId, mode })
    this.loadData()
  },

  onShow() {
    // 从出勤页返回后重新加载
    if (this.data.activityId) {
      this.loadData()
    }
  },

  async loadData() {
    const { activityId } = this.data
    this.setData({ loading: true })

    try {
      // 并行获取活动信息和已有比赛数据（云函数同时返回 confirmedRegs，避免客户端权限问题）
      const [actRes, statsRes] = await Promise.all([
        db.collection('activities').doc(activityId).get(),
        wx.cloud.callFunction({ name: 'getMatchStats', data: { activityId } })
      ])

      const activity = actRes.data
      const openid = app.globalData.openid || wx.getStorageSync('openid')

      // 权限判断：活动创建者 OR 球队管理员/创建者
      const isActivityCreator = activity.createdBy === openid
      let isTeamAdmin = false
      if (!isActivityCreator && activity.teamId) {
        const memberRes = await db.collection('team_members')
          .where({ teamId: activity.teamId, openid })
          .get()
        if (memberRes.data && memberRes.data.length > 0) {
          const role = memberRes.data[0].role
          isTeamAdmin = role === 'creator' || role === 'admin'
        }
      }
      const canEdit = isActivityCreator || isTeamAdmin

      // 优先用云函数返回的 confirmedRegs（云端权限不受限），兜底用客户端数据
      const cloudResult = statsRes.result || {}
      const confirmedRegs = cloudResult.confirmedRegs
        || (activity.registrations || []).filter(r => r.status === 'confirmed')

      // 获取用户信息
      const openids = confirmedRegs.map(r => r.openid)
      const usersMap = openids.length > 0 ? await app.fetchUsersWithCache(openids) : {}

      // 查询球队成员列表，判断每个球员是否为队员（云函数权限不受限，客户端直接查）
      let teamMemberOpenids = []
      if (activity.teamId) {
        try {
          const membersRes = await db.collection('team_members')
            .where({ teamId: activity.teamId })
            .field({ openid: true })
            .get()
          teamMemberOpenids = (membersRes.data || []).map(m => m.openid)
        } catch (e) {
          // 查不到时降级，全员散客
        }
      }

      // 已有 stats 数据
      const existStats = cloudResult.stats || null
      const statsPlayersMap = {}
      if (existStats && existStats.players) {
        existStats.players.forEach(p => { statsPlayersMap[p.openid] = p })
      }

      // 构建球员列表：所有 confirmed 球员都展示
      // attended=true 的排前面，attended=false 的排后面
      const allPlayers = confirmedRegs.map(r => {
        const user = usersMap[r.openid] || {}
        const sp = statsPlayersMap[r.openid] || {}
        const isMember = teamMemberOpenids.includes(r.openid)
        const nickName = user.nickName || r.nickName || '未知'
        const displayName = nickName.length > 4 ? nickName.slice(0, 4) + '...' : nickName
        return {
          openid: r.openid,
          nickName,
          displayName,
          displayAvatar: app.getDisplayAvatar(user) || app.globalData.defaultAvatar,
          memberType: isMember ? 'member' : 'casual',
          type: sp.type || 'member',
          attended: sp.attended !== undefined ? sp.attended : true, // 默认已出勤
          goals: Number(sp.goals) || 0,
          assists: Number(sp.assists) || 0
        }
      })

      // 始终展示所有报名球员：attended=true 排前，false 排后
      const players = [
        ...allPlayers.filter(p => p.attended),
        ...allPlayers.filter(p => !p.attended)
      ]

      const goals = existStats ? (existStats.goals || 0) : 0
      const opponentGoals = existStats ? (existStats.opponentGoals || 0) : 0
      const opponentName = existStats ? (existStats.opponentName || '') : ''
      const result = existStats ? (existStats.result || '') : ''

      this.setData({
        activity,
        goals,
        opponentGoals,
        opponentName,
        result,
        players,
        hasStats: !!existStats,
        canEdit,
        loading: false
      })
      // 导航栏显示活动标题
      wx.setNavigationBarTitle({ title: activity.title || '活动数据' })
    } catch (e) {
      console.error('loadData error', e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // ==================== 编辑模式操作 ====================

  onGoalsInput(e) {
    const val = parseInt(e.detail.value) || 0
    this.setData({ goals: val })
    this.calcResult(val, this.data.opponentGoals)
  },

  onOpponentGoalsInput(e) {
    const val = parseInt(e.detail.value) || 0
    this.setData({ opponentGoals: val })
    this.calcResult(this.data.goals, val)
  },

  // 点击编辑对手名称（弹出输入框，限制10字，确认后直接保存）
  editOpponentName() {
    wx.showModal({
      title: '对手名称',
      editable: true,
      placeholderText: '请输入对手名称（最多10字）',
      content: this.data.opponentName || '',
      success: async (res) => {
        if (res.confirm) {
          const newName = (res.content || '').trim().slice(0, 10)

          // 立即保存到云端
          wx.showLoading({ title: '保存中...' })
          try {
            const { activityId, goals, opponentGoals, players } = this.data
            const result = await wx.cloud.callFunction({
              name: 'saveMatchStats',
              data: { activityId, goals, opponentGoals, opponentName: newName, players }
            })
            wx.hideLoading()
            if (result.result && result.result.success) {
              this.setData({ opponentName: newName })
              wx.showToast({ title: '已保存', icon: 'success' })
            } else {
              wx.showToast({ title: result.result.message || '保存失败', icon: 'none' })
            }
          } catch (e) {
            wx.hideLoading()
            console.error('save opponentName error', e)
            wx.showToast({ title: '保存失败', icon: 'none' })
          }
        }
      }
    })
  },

  calcResult(goals, opponentGoals) {
    let result = 'draw'
    if (goals > opponentGoals) result = 'win'
    else if (goals < opponentGoals) result = 'lose'
    this.setData({ result })
  },

  // 球员进球 +/-
  changeGoals(e) {
    const { index } = e.currentTarget.dataset
    const delta = Number(e.currentTarget.dataset.delta)
    const players = [...this.data.players]
    const cur = players[index].goals || 0
    const newVal = Math.min(99, Math.max(0, cur + delta))
    if (newVal === cur) return // 已达边界，不更新
    players[index] = { ...players[index], goals: newVal }
    this.setData({ players })
  },

  // 球员助攻 +/-
  changeAssists(e) {
    const { index } = e.currentTarget.dataset
    const delta = Number(e.currentTarget.dataset.delta)
    const players = [...this.data.players]
    const cur = players[index].assists || 0
    const newVal = Math.min(99, Math.max(0, cur + delta))
    if (newVal === cur) return // 已达边界，不更新
    players[index] = { ...players[index], assists: newVal }
    this.setData({ players })
  },

  // 切换出勤状态
  toggleAttended(e) {
    const { index } = e.currentTarget.dataset
    const players = [...this.data.players]
    players[index] = { ...players[index], attended: !players[index].attended }
    this.setData({ players })
  },

  // 跳转编辑出勤页面（所有人可查看，有权限才能编辑）
  goEditAttendance() {
    wx.navigateTo({
      url: `/pages/activity/attendance/attendance?activityId=${this.data.activityId}`
    })
  },

  // 保存数据
  async save() {
    if (this.data.saving) return
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中...' })

    try {
      const { activityId, goals, opponentGoals, opponentName, players } = this.data
      const res = await wx.cloud.callFunction({
        name: 'saveMatchStats',
        data: { activityId, goals, opponentGoals, opponentName, players }
      })

      wx.hideLoading()
      if (res.result && res.result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' })
        this.setData({ mode: 'view', saving: false, hasStats: true })
        this.loadData()
      } else {
        wx.showToast({ title: res.result.message || '保存失败', icon: 'none' })
        this.setData({ saving: false })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('save error', e)
      wx.showToast({ title: '保存失败', icon: 'none' })
      this.setData({ saving: false })
    }
  }
})
