// cloudfunctions/joinTeam/index.js
// 加入球队（支持直接加入和申请加入）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const { teamId } = event

  if (!teamId) {
    return { success: false, error: 'TEAM_ID_REQUIRED', message: '球队ID不能为空' }
  }

  try {
    // 查询球队
    const teamRes = await db.collection('teams').doc(teamId).get()
    if (!teamRes.data) {
      return { success: false, error: 'TEAM_NOT_FOUND', message: '球队不存在' }
    }
    const team = teamRes.data
    const joinMethod = team.joinMethod || 'qrcode'

    // 检查是否已加入
    const memberRes = await db.collection('team_members')
      .where({ teamId, openid })
      .get()

    if (memberRes.data && memberRes.data.length > 0) {
      return { success: false, error: 'ALREADY_MEMBER', message: '您已经是球队成员' }
    }

    const now = db.serverDate()

    if (joinMethod === 'qrcode') {
      // 直接加入
      await db.collection('team_members').add({
        data: {
          teamId,
          openid,
          role: 'member',
          joinedAt: now
        }
      })

      await db.collection('teams').doc(teamId).update({
        data: {
          memberCount: db.command.inc(1),
          updatedAt: now
        }
      })

      return { success: true, type: 'direct' }

    } else {
      // 申请加入：写入待审批记录
      // 先查是否有 pending 状态的申请（rejected 后可重新申请）
      const applyRes = await db.collection('team_applications')
        .where({ teamId, openid, status: 'pending' })
        .get()

      if (applyRes.data && applyRes.data.length > 0) {
        return { success: false, error: 'ALREADY_APPLIED', message: '您已提交过申请，请等待审批' }
      }

      await db.collection('team_applications').add({
        data: {
          teamId,
          openid,
          status: 'pending', // pending / approved / rejected
          appliedAt: now
        }
      })

      return { success: true, type: 'apply' }
    }
  } catch (err) {
    console.error('joinTeam error:', err)
    return { success: false, error: err.message }
  }
}
