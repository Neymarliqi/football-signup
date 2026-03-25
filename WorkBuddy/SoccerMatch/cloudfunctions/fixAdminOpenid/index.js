// 修复脚本：更新 admins 集合中的 openid
// 在云开发控制台 → 数据库 → 云函数 → 运行此脚本

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    // 删除错误的 openid 记录
    await db.collection('admins').where({
      openid: 'o1hdR4zFTRIhXtek3ck_1rNqqS4g'
    }).remove()
    
    // 添加正确的 openid
    await db.collection('admins').add({
      data: {
        openid: 'o1hdR4zFTRIhXtek3ck_lrNqqS4g',
        createdAt: db.serverDate()
      }
    })
    
    return { success: true, message: '已修复管理员openid' }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
