// cloudfunctions/setAdmin/index.js
// 设置用户为管理员（通过完整openid）
// 注意：admins集合存储的是微信完整openid，不是短ID
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { targetOpenid, isAdmin } = event

  if (!targetOpenid) {
    return {
      success: false,
      message: '缺少用户openid'
    }
  }

  try {
    if (isAdmin === false) {
      // 取消管理员：从 admins 集合删除记录
      await db.collection('admins').where({ openid: targetOpenid }).remove()
      return {
        success: true,
        message: '已取消管理员权限',
        openid: targetOpenid
      }
    } else {
      // 设置为管理员：在 admins 集合添加记录
      const existing = await db.collection('admins').where({ openid: targetOpenid }).get()
      if (existing.data.length > 0) {
        return {
          success: true,
          message: '用户已是管理员',
          openid: targetOpenid
        }
      }

      await db.collection('admins').add({
        data: {
          openid: targetOpenid,
          createdAt: db.serverDate()
        }
      })

      return {
        success: true,
        message: '已设为管理员',
        openid: targetOpenid
      }
    }
  } catch (e) {
    console.error('设置管理员失败', e)
    return {
      success: false,
      message: e.message || '设置失败'
    }
  }
}
