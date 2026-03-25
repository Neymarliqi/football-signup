// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const result = {
    users: [],
    activities: [],
    errors: []
  }

  try {
    // 1. 查询 users 集合（限制前 10 条）
    console.log('查询 users 集合...')
    const usersRes = await db.collection('users').limit(10).get()
    result.users = usersRes.data.map(user => {
      return {
        _id: user._id,
        openid: user.openid,
        nickName: user.nickName,
        avatarUrl: user.avatarUrl,
        positions: user.positions,
        updatedAt: user.updatedAt
      }
    })
    console.log('users 集合查询成功，共', result.users.length, '条')

  } catch (e) {
    console.error('查询 users 集合失败:', e)
    result.errors.push('users 集合查询失败: ' + e.message)
  }

  try {
    // 2. 查询 activities 集合（限制前 3 条，只取部分字段）
    console.log('查询 activities 集合...')
    const activitiesRes = await db.collection('activities').limit(3).get()
    result.activities = activitiesRes.data.map(act => {
      return {
        _id: act._id,
        title: act.title,
        createdBy: act.createdBy,
        registrations: act.registrations ? act.registrations.slice(0, 5).map(r => ({
          openid: r.openid,
          nickName: r.nickName,
          avatarUrl: r.avatarUrl
        })) : [],
        registrationsCount: act.registrations ? act.registrations.length : 0
      }
    })
    console.log('activities 集合查询成功，共', result.activities.length, '条')

  } catch (e) {
    console.error('查询 activities 集合失败:', e)
    result.errors.push('activities 集合查询失败: ' + e.message)
  }

  try {
    // 3. 查询云存储文件（avatars 目录）
    console.log('查询云存储文件...')
    const filesRes = await cloud.getTempFileURL({
      fileList: [] // 空数组，只测试连接
    })
    console.log('云存储连接正常')
    result.cloudStorageStatus = 'connected'

  } catch (e) {
    console.error('云存储连接失败:', e)
    result.cloudStorageStatus = 'failed'
    result.errors.push('云存储连接失败: ' + e.message)
  }

  return {
    success: true,
    data: result
  }
}
