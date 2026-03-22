// 云函数：清空所有活动数据
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { confirm } = event
  
  if (confirm !== 'DELETE_ALL') {
    return { 
      success: false, 
      message: '请提供 confirm: "DELETE_ALL" 参数以确认删除所有数据' 
    }
  }

  try {
    // 获取所有活动
    const { data: activities } = await db.collection('activities').get()
    
    // 批量删除
    const batchSize = 100
    let deletedCount = 0
    
    for (let i = 0; i < activities.length; i += batchSize) {
      const batch = activities.slice(i, i + batchSize)
      const deletePromises = batch.map(item => 
        db.collection('activities').doc(item._id).remove()
      )
      await Promise.all(deletePromises)
      deletedCount += batch.length
    }
    
    // 同时清空战术板数据
    const { data: tactics } = await db.collection('tactics').get()
    for (let i = 0; i < tactics.length; i += batchSize) {
      const batch = tactics.slice(i, i + batchSize)
      const deletePromises = batch.map(item => 
        db.collection('tactics').doc(item._id).remove()
      )
      await Promise.all(deletePromises)
    }
    
    return {
      success: true,
      message: `成功清空 ${deletedCount} 条活动数据和 ${tactics.length} 条战术数据`
    }
  } catch (err) {
    return {
      success: false,
      message: '清空失败',
      error: err.message
    }
  }
}
