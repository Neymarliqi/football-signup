// cloudfunctions/handleTeamApplication/index.js
// 处理球队加入申请（审批/拒绝）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const { teamId, targetOpenid, action } = event // action: approve / reject

  console.log('[handleTeamApplication] 调用参数:', { openid, teamId, targetOpenid, action })

  if (!teamId || !targetOpenid || !action) {
    return { success: false, message: '参数不完整' }
  }

  if (!['approve', 'reject'].includes(action)) {
    return { success: false, message: '无效操作' }
  }

  try {
    // 验证操作者身份（必须是创建者或管理员）
    console.log('[handleTeamApplication] 查询 team_members, openid:', openid, 'teamId:', teamId)
    const memberRes = await db.collection('team_members')
      .where({ teamId, openid })
      .get()

    console.log('[handleTeamApplication] team_members 查询结果:', memberRes.data)

    let isCreatorViaTeams = false

    if (!memberRes.data || memberRes.data.length === 0) {
      // team_members 为空，检查是否是球队创建者
      const teamRes = await db.collection('teams').doc(teamId).get()
      console.log('[handleTeamApplication] teams 查询结果:', teamRes.data)
      if (teamRes.data && teamRes.data.creatorOpenid === openid) {
        isCreatorViaTeams = true
        console.log('[handleTeamApplication] 创建者身份验证通过（teams.creatorOpenid 匹配）')
      } else {
        return { success: false, message: '您不是球队成员' }
      }
    } else {
      const myRole = memberRes.data[0].role
      console.log('[handleTeamApplication] 用户角色:', myRole)
      if (myRole !== 'creator' && myRole !== 'admin') {
        return { success: false, message: '只有管理员可以审批' }
      }
    }

    // 查找申请记录
    const applyRes = await db.collection('team_applications')
      .where({ teamId, openid: targetOpenid })
      .get()

    if (!applyRes.data || applyRes.data.length === 0) {
      return { success: false, message: '没有找到该申请' }
    }

    const apply = applyRes.data[0]

    if (apply.status !== 'pending') {
      return { success: false, message: '该申请已处理过' }
    }

    const now = db.serverDate()

    if (action === 'approve') {
      // 通过：写入成员记录
      await db.collection('team_members').add({
        data: {
          teamId,
          openid: targetOpenid,
          role: 'member',
          joinedAt: now
        }
      })

      // memberCount +1
      await db.collection('teams').doc(teamId).update({
        data: {
          memberCount: db.command.inc(1),
          updatedAt: now
        }
      })

      // 更新申请状态
      await db.collection('team_applications').doc(apply._id).update({
        data: { status: 'approved', handledAt: now }
      })

      return { success: true }

    } else {
      // 拒绝
      await db.collection('team_applications').doc(apply._id).update({
        data: { status: 'rejected', handledAt: now }
      })

      return { success: true }
    }
  } catch (err) {
    console.error('handleTeamApplication error:', err)
    return { success: false, message: err.message }
  }
}
