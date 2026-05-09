// pages/activity/attendance/attendance.js
// 编辑出勤页面
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    activityId: '',
    activity: {},
    // 已报名球员列表（confirmed 状态，默认出勤）
    confirmedPlayers: [],
    // 未报名但可额外标记的球队成员（teamId 存在时）
    extraMembers: [],
    saving: false,
    loading: true
  },

  onLoad(options) {
    const { activityId } = options
    if (!activityId) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      wx.navigateBack()
      return
    }
    this.setData({ activityId })
    wx.setNavigationBarTitle({ title: '标记出勤' })
    this.loadData()
  },

  async loadData() {
    const { activityId } = this.data
    this.setData({ loading: true })

    try {
      // 1. 获取活动信息
      const actRes = await db.collection('activities').doc(activityId).get()
      const activity = actRes.data

      // 2. 获取已有的 match_stats（读取出勤/进球/助攻）
      const statsRes = await wx.cloud.callFunction({ name: 'getMatchStats', data: { activityId } })
      const existStats = statsRes.result && statsRes.result.stats
      const statsPlayersMap = {}
      if (existStats && existStats.players) {
        existStats.players.forEach(p => { statsPlayersMap[p.openid] = p })
      }

      // 3. 已报名球员
      const confirmedRegs = (activity.registrations || []).filter(r => r.status === 'confirmed')
      const openids = confirmedRegs.map(r => r.openid)
      const usersMap = openids.length > 0 ? await app.fetchUsersWithCache(openids) : {}

      // 4. 如果有球队，先查 member/casual 归属，用于判断 type
      const memberOpenidSet = new Set()
      const casualOpenidSet = new Set()
      if (activity.teamId) {
        const [membersRes, casualsRes] = await Promise.all([
          db.collection('team_members').where({ teamId: activity.teamId }).get(),
          db.collection('team_casuals').where({ teamId: activity.teamId }).get()
        ])
        ;(membersRes.data || []).forEach(m => memberOpenidSet.add(m.openid))
        ;(casualsRes.data || []).forEach(c => casualOpenidSet.add(c.openid))
      }

      // 5. 组装已报名球员（type 以 team_members/team_casuals 为准，match_stats 优先）
      const confirmedPlayers = confirmedRegs.map(r => {
        const user = usersMap[r.openid] || {}
        const sp = statsPlayersMap[r.openid]

        // type 判断：始终以 team_members/team_casuals 查询为准（不信任 match_stats 里的旧数据）
        let type = 'member'
        if (memberOpenidSet.has(r.openid)) {
          type = 'member'
        } else if (casualOpenidSet.has(r.openid)) {
          type = 'casual'
        } else {
          type = 'casual' // 不在球队成员表里，就不是队员
        }

        return {
          openid: r.openid,
          nickName: user.nickName || r.nickName || '未知',
          displayAvatar: app.getDisplayAvatar(user) || app.globalData.defaultAvatar,
          attended: sp !== undefined ? sp.attended : true,  // 默认已出勤
          goals: sp ? (sp.goals || 0) : 0,
          assists: sp ? (sp.assists || 0) : 0,
          type,
          fromReg: true
        }
      })

      // 6. 未报名的球队成员 + 散客（允许额外标记出勤）
      let extraMembers = []
      if (activity.teamId) {
        const [membersRes, casualsRes] = await Promise.all([
          db.collection('team_members').where({ teamId: activity.teamId }).get(),
          db.collection('team_casuals').where({ teamId: activity.teamId }).get()
        ])
        const confirmedOpenids = new Set(openids)

        const memberOpenids = (membersRes.data || [])
          .map(m => m.openid)
          .filter(id => !confirmedOpenids.has(id))
        const casualOpenids = (casualsRes.data || [])
          .map(c => c.openid)
          .filter(id => !confirmedOpenids.has(id))

        const extraOpenids = [...memberOpenids, ...casualOpenids]

        if (extraOpenids.length > 0) {
          const extraUsersMap = await app.fetchUsersWithCache(extraOpenids)
          extraMembers = extraOpenids.map(oid => {
            const user = extraUsersMap[oid] || {}
            const sp = statsPlayersMap[oid]
            const isMember = memberOpenids.includes(oid)

            let type = isMember ? 'member' : 'casual'
            // 不以 match_stats 的旧 type 为准，始终以数据库查询结果为依据

            return {
              openid: oid,
              nickName: user.nickName || '未知',
              displayAvatar: app.getDisplayAvatar(user) || app.globalData.defaultAvatar,
              attended: sp !== undefined ? sp.attended : false, // 默认未出勤
              goals: sp ? (sp.goals || 0) : 0,
              assists: sp ? (sp.assists || 0) : 0,
              type,
              fromReg: false
            }
          })
        }
      }

      this.setData({ activity, confirmedPlayers, extraMembers, loading: false })
    } catch (e) {
      console.error('attendance loadData error', e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // 切换出勤状态
  toggleAttended(e) {
    const { openid, section } = e.currentTarget.dataset
    const key = section === 'extra' ? 'extraMembers' : 'confirmedPlayers'
    const list = [...this.data[key]]
    const idx = list.findIndex(p => p.openid === openid)
    if (idx >= 0) {
      list[idx] = { ...list[idx], attended: !list[idx].attended }
      this.setData({ [key]: list })
    }
  },

  // 全选已报名
  toggleAllConfirmed() {
    const { confirmedPlayers } = this.data
    const allAttended = confirmedPlayers.every(p => p.attended)
    this.setData({
      confirmedPlayers: confirmedPlayers.map(p => ({ ...p, attended: !allAttended }))
    })
  },

  // 提交出勤
  async submit() {
    if (this.data.saving) return
    this.setData({ saving: true })
    wx.showLoading({ title: '提交中...' })

    try {
      const { activityId, confirmedPlayers, extraMembers } = this.data

      // 合并所有球员数据，只取出勤状态和保留原有进球/助攻
      const allPlayers = [...confirmedPlayers, ...extraMembers]

      // 先获取已有的 match_stats，保留进球/助攻数据
      const statsRes = await wx.cloud.callFunction({ name: 'getMatchStats', data: { activityId } })
      const existStats = statsRes.result && statsRes.result.stats
      const existPlayersMap = {}
      if (existStats && existStats.players) {
        existStats.players.forEach(p => { existPlayersMap[p.openid] = p })
      }

      // 合并：用新的出勤状态，保留原进球/助攻
      const mergedPlayers = allPlayers.map(p => ({
        openid: p.openid,
        type: p.type || 'member',
        attended: p.attended,
        goals: existPlayersMap[p.openid] ? (existPlayersMap[p.openid].goals || 0) : 0,
        assists: existPlayersMap[p.openid] ? (existPlayersMap[p.openid].assists || 0) : 0
      }))

      const goals = existStats ? (existStats.goals || 0) : 0
      const opponentGoals = existStats ? (existStats.opponentGoals || 0) : 0

      const res = await wx.cloud.callFunction({
        name: 'saveMatchStats',
        data: { activityId, goals, opponentGoals, players: mergedPlayers }
      })

      wx.hideLoading()
      if (res.result && res.result.success) {
        wx.showToast({ title: '出勤已保存', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 1000)
      } else {
        wx.showToast({ title: res.result.message || '提交失败', icon: 'none' })
        this.setData({ saving: false })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('attendance submit error', e)
      wx.showToast({ title: '提交失败', icon: 'none' })
      this.setData({ saving: false })
    }
  }
})
