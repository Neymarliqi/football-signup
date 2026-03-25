// cloudfunctions/fixAvatarFiles/index.js
// 修复头像文件问题：删除包含undefined的云存储文件，并更新数据库
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  try {
    // 1. 查找所有 avatarUrl 包含 undefined 的用户
    const { data: users } = await db.collection('users')
      .where({
        avatarUrl: db.RegExp({
          regexp: 'undefined',
          options: 'i'
        })
      })
      .get()

    console.log(`找到 ${users.length} 个包含 undefined 的 avatarUrl`)

    const results = {
      deletedFiles: [],
      updatedUsers: [],
      errors: []
    }

    for (const user of users) {
      const oldUrl = user.avatarUrl
      console.log(`处理用户: ${user.openid}, 旧URL: ${oldUrl}`)

      try {
        // 2. 删除云存储中的错误文件
        try {
          await cloud.deleteFile({
            fileList: [oldUrl]
          })
          console.log(`已删除文件: ${oldUrl}`)
          results.deletedFiles.push(oldUrl)
        } catch (deleteErr) {
          console.error(`删除文件失败: ${oldUrl}`, deleteErr)
          // 文件可能已删除，继续更新数据库
        }

        // 3. 更新数据库，清空错误的 avatarUrl
        await db.collection('users').doc(user.openid).update({
          data: {
            avatarUrl: '',
            updatedAt: db.serverDate()
          }
        })

        console.log(`已更新用户: ${user.openid}`)
        results.updatedUsers.push(user.openid)

      } catch (err) {
        console.error(`处理用户失败: ${user.openid}`, err)
        results.errors.push({
          openid: user.openid,
          error: err.message
        })
      }
    }

    return {
      success: true,
      message: `处理完成：删除 ${results.deletedFiles.length} 个文件，更新 ${results.updatedUsers.length} 个用户`,
      results
    }
  } catch (err) {
    console.error('fixAvatarFiles error:', err)
    return {
      success: false,
      error: err.message
    }
  }
}
