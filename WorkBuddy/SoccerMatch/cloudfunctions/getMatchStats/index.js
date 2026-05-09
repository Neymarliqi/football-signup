// cloudfunctions/getMatchStats/index.js
// 查询单场活动的比赛数据（同时返回活动报名人员）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const { activityId } = event

  if (!activityId) {
    return { success: false, message: '缺少 activityId' }
  }

  try {
    // 并行查 match_stats 和 activities
    const [statsRes, actRes] = await Promise.all([
      db.collection('match_stats').where({ activityId }).get(),
      db.collection('activities').doc(activityId).get()
    ])

    const stats = (statsRes.data && statsRes.data.length > 0) ? statsRes.data[0] : null

    // 返回 confirmed 报名人员（云函数权限不受客户端限制）
    const activity = actRes.data || {}
    const registrations = activity.registrations || []
    const confirmedRegs = registrations.filter(r => r.status === 'confirmed')

    return {
      success: true,
      stats,
      confirmedRegs  // [{ openid, nickName, ... }]
    }
  } catch (e) {
    console.error('getMatchStats error:', e)
    return { success: false, message: e.message || '查询失败' }
  }
}
