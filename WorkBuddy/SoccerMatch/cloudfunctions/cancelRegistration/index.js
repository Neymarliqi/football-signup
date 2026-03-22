// cloudfunctions/cancelRegistration/index.js
// 取消报名
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { activityId } = event

  try {
    const actRes = await db.collection('activities').doc(activityId).get()
    const activity = actRes.data
    const registrations = activity.registrations || []

    // 检查活动状态是否允许取消报名
    const now = new Date()
    const actDate = activity.activityDate instanceof Date ? activity.activityDate : new Date(activity.activityDate)
    if (activity.status === 'finished' || actDate < now) {
      return { success: false, error: 'ACTIVITY_ENDED', message: '活动已结束，无法取消报名' }
    }
    if (activity.status === 'cancelled') {
      return { success: false, error: 'ACTIVITY_CANCELLED', message: '活动已取消，无法操作' }
    }

    // 检查用户是否已报名
    const existingIndex = registrations.findIndex(r => r.openid === openid)
    if (existingIndex < 0) {
      return { success: false, error: 'NOT_REGISTERED', message: '您尚未报名该活动' }
    }

    const newRegistrations = registrations.filter(r => r.openid !== openid)

    await db.collection('activities').doc(activityId).update({
      data: { registrations: newRegistrations, updatedAt: db.serverDate() }
    })

    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
