// cloudfunctions/saveTactics/index.js
// 保存/更新战术板（仅活动创建者和已报名者可操作）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const { activityId, positions } = event

  if (!activityId) {
    return { success: false, message: '缺少 activityId' }
  }

  try {
    // 1. 获取活动信息，校验权限
    const actRes = await db.collection('activities').doc(activityId).get()
    const activity = actRes.data
    if (!activity) {
      return { success: false, message: '活动不存在' }
    }

    // 2. 权限校验：创建者 或 已报名（confirmed）
    const isCreator = activity.createdBy === openid
    const registrations = activity.registrations || []
    const isParticipant = registrations.some(r => r.openid === openid && r.status === 'confirmed')

    if (!isCreator && !isParticipant) {
      return { success: false, message: '只有创建者和报名者可以保存战术' }
    }

    // 3. 查询是否已有战术记录
    const existRes = await db.collection('tactics').where({ activityId }).get()

    if (existRes.data && existRes.data.length > 0) {
      // 更新
      await db.collection('tactics').doc(existRes.data[0]._id).update({
        data: {
          positions,
          updatedBy: openid,
          updatedAt: db.serverDate()
        }
      })
    } else {
      // 新建
      await db.collection('tactics').add({
        data: {
          activityId,
          positions,
          createdBy: openid,
          createdAt: db.serverDate()
        }
      })
    }

    return { success: true, message: '保存成功' }
  } catch (e) {
    console.error('saveTactics error:', e)
    return { success: false, message: e.message || '保存失败' }
  }
}
