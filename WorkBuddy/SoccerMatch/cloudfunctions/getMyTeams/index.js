// cloudfunctions/getMyTeams/index.js
// 获取我的球队列表（创建的 + 加入的，含身份）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, error: 'NO_OPENID', message: '未获取到用户身份' }
  }

  try {
    // 并行查询：成员记录 + 创建的球队（互不依赖）
    const [memberRes, createdTeamsRes] = await Promise.all([
      db.collection('team_members').where({ openid }).get(),
      db.collection('teams').where({ creatorOpenid: openid }).field({ _id: true }).get()
    ])

    const createdTeamIds = createdTeamsRes.data.map(t => t._id)
    const memberTeamIds = memberRes.data ? memberRes.data.map(m => m.teamId) : []

    // 合并所有相关球队ID
    const allTeamIds = [...new Set([...createdTeamIds, ...memberTeamIds])]

    if (allTeamIds.length === 0) {
      return { success: true, createdTeams: [], joinedTeams: [] }
    }

    const myMemberships = {}
    if (memberRes.data) {
      memberRes.data.forEach(m => {
        myMemberships[m.teamId] = m
      })
    }

    // 批量查询球队详情
    const teamRes = await db.collection('teams')
      .where({
        _id: db.command.in(allTeamIds)
      })
      .get()

    // 按身份分类
    const createdTeams = []
    const joinedTeams = []

    teamRes.data.forEach(team => {
      // 检查是否是创建者（teams.creatorOpenid 匹配）
      const isCreator = team.creatorOpenid === openid
      const member = myMemberships[team._id]

      // 如果既不是成员也不是创建者，跳过
      if (!member && !isCreator) return

      // 确定角色
      let myRole = member ? member.role : 'creator'
      if (isCreator && (!member || member.role !== 'creator')) {
        myRole = 'creator'
      }

      const item = {
        ...team,
        myRole,
        joinedAt: member ? member.joinedAt : team.createdAt
      }

      if (myRole === 'creator') {
        createdTeams.push(item)
      } else {
        joinedTeams.push(item)
      }
    })

    // 按创建时间倒序
    createdTeams.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    joinedTeams.sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0))

    return {
      success: true,
      createdTeams,
      joinedTeams
    }
  } catch (err) {
    console.error('getMyTeams error:', err)
    return { success: false, error: err.message }
  }
}
