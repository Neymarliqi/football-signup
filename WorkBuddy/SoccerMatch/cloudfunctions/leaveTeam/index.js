// cloudfunctions/leaveTeam/index.js
// 退出球队（创建者不可退出，需先转让或解散）
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

    // 查询成员记录
    const memberRes = await db.collection('team_members')
      .where({ teamId, openid })
      .get()

    if (!memberRes.data || memberRes.data.length === 0) {
      return { success: false, error: 'NOT_MEMBER', message: '您不是球队成员' }
    }
    const member = memberRes.data[0]

    // 创建者不可退出
    if (member.role === 'creator') {
      return {
        success: false,
        error: 'CREATOR_CANNOT_LEAVE',
        message: '球队创建者不可退出，请先转让创建者身份或解散球队'
      }
    }

    // 删除成员记录
    await db.collection('team_members').doc(member._id).remove()

    // memberCount -1
    await db.collection('teams').doc(teamId).update({
      data: {
        memberCount: db.command.inc(-1),
        updatedAt: db.serverDate()
      }
    })

    return { success: true, message: '已退出球队' }
  } catch (err) {
    console.error('leaveTeam error:', err)
    return { success: false, error: err.message }
  }
}
