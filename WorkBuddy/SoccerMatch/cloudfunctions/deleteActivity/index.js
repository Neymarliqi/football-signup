// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const { activityId, openid } = event
  
  if (!activityId || !openid) {
    return {
      success: false,
      message: '参数缺失'
    }
  }
  
  try {
    // 获取活动信息
    const activityRes = await db.collection('activities').doc(activityId).get()
    if (!activityRes.data) {
      return {
        success: false,
        message: '活动不存在'
      }
    }
    
    // 权限检查：只有创建者可以删除
    if (activityRes.data.createdBy !== openid) {
      return {
        success: false,
        message: '无权删除'
      }
    }
    
    // 删除活动
    await db.collection('activities').doc(activityId).remove()
    
    return {
      success: true,
      message: '删除成功'
    }
  } catch (e) {
    console.error('删除活动失败', e)
    return {
      success: false,
      message: e.message || '删除失败'
    }
  }
}
