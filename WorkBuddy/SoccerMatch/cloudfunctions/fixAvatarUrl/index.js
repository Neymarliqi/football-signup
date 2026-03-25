// cloudfunctions/fixAvatarUrl/index.js
// 修复数据库中错误的头像URL（包含undefined的记录）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  try {
    // 查询所有包含 undefined 的 avatarUrl
    const res = await db.collection('users')
      .where({
        avatarUrl: db.RegExp({
          regexp: 'undefined',
          options: 'i'
        })
      })
      .get()

    const users = res.data
    console.log('找到', users.length, '条错误记录')

    let fixedCount = 0

    // 批量修复
    for (const user of users) {
      try {
        await db.collection('users').doc(user.openid).update({
          data: {
            avatarUrl: '', // 清空错误的 avatarUrl
            updatedAt: db.serverDate()
          }
        })
        console.log('已修复:', user.openid)
        fixedCount++
      } catch (e) {
        console.error('修复失败:', user.openid, e)
      }
    }

    return {
      success: true,
      message: `修复完成，共 ${fixedCount} 条记录`
    }
  } catch (err) {
    console.error('fixAvatarUrl error:', err)
    return {
      success: false,
      error: err.message
    }
  }
}
