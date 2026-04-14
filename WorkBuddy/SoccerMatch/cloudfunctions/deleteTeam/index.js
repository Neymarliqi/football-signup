// cloudfunctions/deleteTeam/index.js
// 解散球队（仅创建者可调用，需检查无进行中活动）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

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

    // 权限检查：仅创建者可解散
    if (team.creatorOpenid !== openid) {
      return { success: false, error: 'NO_PERMISSION', message: '仅球队创建者可解散球队' }
    }

    // 检查是否有进行中的活动（status=open 或 ongoing，且日期未过）
    const now = new Date()
    const activitiesRes = await db.collection('activities')
      .where({
        teamId,
        status: _.in(['open', 'ongoing']),
        activityDate: _.gte(now)
      })
      .count()

    if (activitiesRes.total > 0) {
      return {
        success: false,
        error: 'HAS_ONGOING_ACTIVITIES',
        message: `球队还有 ${activitiesRes.total} 场进行中的活动，请先结束或取消`
      }
    }

    // 将球队相关的已结束/已取消活动清除 teamId（变为公开历史活动）
    await db.collection('activities')
      .where({ teamId })
      .update({
        data: {
          teamId: '',
          teamName: '',
          visibility: 'open'
        }
      })

    // 删除所有成员记录
    await db.collection('team_members').where({ teamId }).remove()

    // 删除所有散客记录
    await db.collection('team_casuals').where({ teamId }).remove()

    // 删除球队记录
    await db.collection('teams').doc(teamId).remove()

    return { success: true, message: '球队已解散' }
  } catch (err) {
    console.error('deleteTeam error:', err)
    return { success: false, error: err.message }
  }
}
