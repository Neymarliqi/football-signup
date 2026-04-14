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
    // 查询我参与的所有球队成员记录
    const memberRes = await db.collection('team_members')
      .where({ openid })
      .get()

    if (!memberRes.data || memberRes.data.length === 0) {
      return { success: true, createdTeams: [], joinedTeams: [] }
    }

    const teamIds = memberRes.data.map(m => m.teamId)
    const myMemberships = {}
    memberRes.data.forEach(m => {
      myMemberships[m.teamId] = m
    })

    // 批量查询球队详情
    const teamRes = await db.collection('teams')
      .where({
        _id: db.command.in(teamIds)
      })
      .get()

    // 按身份分类
    const createdTeams = []
    const joinedTeams = []

    teamRes.data.forEach(team => {
      const member = myMemberships[team._id]
      if (!member) return

      const item = {
        ...team,
        myRole: member.role,
        joinedAt: member.joinedAt
      }

      if (member.role === 'creator') {
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
