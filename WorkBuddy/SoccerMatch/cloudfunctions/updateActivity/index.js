// cloudfunctions/updateActivity/index.js
// 更新活动信息（支持添加新字段）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  const { activityId, data } = event
  
  if (!activityId || !data) {
    return { success: false, error: '参数缺失' }
  }

  try {
    // 获取活动信息，检查权限
    const actRes = await db.collection('activities').doc(activityId).get()
    const activity = actRes.data
    
    if (!activity) {
      return { success: false, error: '活动不存在' }
    }
    
    // 权限检查：只有创建者可以编辑
    if (activity.createdBy !== openid) {
      return { success: false, error: '无权编辑此活动' }
    }
    
    // 状态检查：只有open或ongoing状态可编辑
    const now = new Date()
    const actDate = activity.activityDate instanceof Date ? activity.activityDate : new Date(activity.activityDate)
    if (activity.status === 'finished' || actDate < now) {
      return { success: false, error: '活动已结束，无法编辑' }
    }
    if (activity.status === 'cancelled') {
      return { success: false, error: '活动已取消，无法编辑' }
    }
    
    // 构建更新数据，处理特殊类型
    const updateData = {}
    
    // 复制所有字段，处理日期类型
    for (const key in data) {
      if (key === 'activityDate') {
        // 活动日期必须存在，转换为 Date 对象
        if (data[key]) {
          updateData[key] = new Date(data[key])
        }
      } else if (key === 'deadline') {
        // 截止时间可能为空，有值时才转换
        if (data[key] && data[key] !== '' && data[key] !== null) {
          updateData[key] = new Date(data[key])
        } else {
          // 明确设置为空/null，确保可以清除截止时间
          updateData[key] = null
        }
      } else if (key === 'updatedAt' && data[key] && data[key]['$date']) {
        // 跳过客户端传来的 serverDate，使用云端的
        continue
      } else if (key === 'latitude' || key === 'longitude') {
        // 确保经纬度是数字类型
        updateData[key] = Number(data[key]) || 0
      } else if (key === 'maxPlayers' || key === 'fee') {
        // 确保数值字段是整数
        updateData[key] = parseInt(data[key]) || 0
      } else if (key === 'allowPending') {
        // 确保布尔值
        updateData[key] = Boolean(data[key])
      } else {
        updateData[key] = data[key]
      }
    }
    
    // 添加服务器时间
    updateData.updatedAt = db.serverDate()
    
    const result = await db.collection('activities').doc(activityId).update({
      data: updateData
    })

    return { 
      success: true, 
      message: '更新成功',
      result: result
    }
  } catch (err) {
    console.error('updateActivity error:', err)
    return { success: false, error: err.message }
  }
}
