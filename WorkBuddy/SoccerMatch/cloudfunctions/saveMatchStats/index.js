// cloudfunctions/saveMatchStats/index.js
// 新建或更新一场比赛数据（含权限校验）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const { activityId, goals, opponentGoals, opponentName, players } = event

  if (!activityId) {
    return { success: false, message: '缺少 activityId' }
  }

  try {
    // 1. 获取活动信息
    const actRes = await db.collection('activities').doc(activityId).get()
    const activity = actRes.data
    if (!activity) {
      return { success: false, message: '活动不存在' }
    }

    // 2. 权限校验：活动创建者 OR 所属球队的管理员/创建者
    const isActivityCreator = activity.createdBy === openid
    let isTeamAdmin = false

    if (!isActivityCreator && activity.teamId) {
      const memberRes = await db.collection('team_members')
        .where({ teamId: activity.teamId, openid, role: _.in(['creator', 'admin']) })
        .get()
      isTeamAdmin = memberRes.data && memberRes.data.length > 0
    }

    if (!isActivityCreator && !isTeamAdmin) {
      return { success: false, message: '无权限录入数据' }
    }

    // 3. 自动计算胜负平
    const myGoals = typeof goals === 'number' ? goals : 0
    const theirGoals = typeof opponentGoals === 'number' ? opponentGoals : 0
    let result = 'draw'
    if (myGoals > theirGoals) result = 'win'
    else if (myGoals < theirGoals) result = 'lose'

    // 4. 查询是否已有记录
    const existRes = await db.collection('match_stats')
      .where({ activityId })
      .get()

    const statsData = {
      activityId,
      teamId: activity.teamId || '',
      goals: myGoals,
      opponentGoals: theirGoals,
      opponentName: opponentName || '',
      result,
      players: players || [],
      updatedAt: db.serverDate(),
      updatedBy: openid
    }

    if (existRes.data && existRes.data.length > 0) {
      // 更新
      await db.collection('match_stats').doc(existRes.data[0]._id).update({ data: statsData })
    } else {
      // 新建
      statsData.createdAt = db.serverDate()
      await db.collection('match_stats').add({ data: statsData })
    }

    return { success: true, message: '保存成功', result }
  } catch (e) {
    console.error('saveMatchStats error:', e)
    return { success: false, message: e.message || '保存失败' }
  }
}
