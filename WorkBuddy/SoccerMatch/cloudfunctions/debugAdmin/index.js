// 调试云函数：检查 admins 集合的记录
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    // 查询 admins 集合的所有记录
    const res = await db.collection('admins').get()

    return {
      success: true,
      count: res.data.length,
      records: res.data
    }
  } catch (e) {
    return {
      success: false,
      error: e.message
    }
  }
}
