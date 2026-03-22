// cloudfunctions/updateUserPosition/index.js
// 更新用户在所有已报名活动中的位置信息
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { positions } = event

  try {
    // 1. 查找用户参与的所有活动
    const activitiesRes = await db.collection('activities').where({
      'registrations.openid': openid
    }).get()

    const activities = activitiesRes.data
    if (activities.length === 0) {
      return { success: true, message: '没有需要更新的活动', updatedCount: 0 }
    }

    // 2. 更新每个活动中的用户位置
    let updatedCount = 0
    for (const activity of activities) {
      const registrations = activity.registrations || []
      const userIndex = registrations.findIndex(r => r.openid === openid)
      
      if (userIndex >= 0) {
        // 更新用户的位置信息
        registrations[userIndex].position = positions
        
        // 保存到数据库
        await db.collection('activities').doc(activity._id).update({
          data: {
            registrations: registrations,
            updatedAt: db.serverDate()
          }
        })
        updatedCount++
      }
    }

    return { 
      success: true, 
      message: `已更新 ${updatedCount} 个活动`,
      updatedCount 
    }
  } catch (err) {
    console.error('updateUserPosition error:', err)
    return { success: false, error: err.message }
  }
}
