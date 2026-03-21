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
    const registrations = actRes.data.registrations || []

    const newRegistrations = registrations.filter(r => r.openid !== openid)

    await db.collection('activities').doc(activityId).update({
      data: { registrations: newRegistrations, updatedAt: db.serverDate() }
    })

    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
