/**
 * 数据修复脚本：修复缺失的 team_casuals 记录
 *
 * 使用方法：
 * 1. 在微信开发者工具中打开 miniprogram 文件夹
 * 2. 打开云开发控制台
 * 3. 在"云函数"中创建新函数 fixMissingCasuals
 * 4. 粘贴此代码并部署
 * 5. 调用函数即可修复
 *
 * 注意：此脚本为一次性使用，修复后可以删除
 */

// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const adminOpenid = wxContext.OPENID

  // 简单权限校验（可自行修改为管理员 openid 列表）
  const admins = await db.collection('admins').get()
  const isAdmin = admins.data.some(a => a.openid === adminOpenid)
  if (!isAdmin) {
    return { success: false, error: 'NO_PERMISSION', message: '需要管理员权限' }
  }

  const results = {
    totalActivities: 0,
    totalCasualsFixed: 0,
    errors: []
  }

  try {
    // 1. 获取所有球队活动
    const activitiesRes = await db.collection('activities')
      .where({ teamId: db.command.exists(true) })
      .field({ _id: true, teamId: true, title: true, registrations: true })
      .limit(100)
      .get()

    results.totalActivities = activitiesRes.data.length

    // 2. 遍历每个活动，修复缺失的散客记录
    for (const activity of activitiesRes.data) {
      const registrations = activity.registrations || []
      const confirmedPlayers = registrations.filter(r => r.status === 'confirmed')

      for (const player of confirmedPlayers) {
        try {
          // 检查是否已经是球队成员
          const memberRes = await db.collection('team_members')
            .where({ teamId: activity.teamId, openid: player.openid })
            .get()

          if (memberRes.data && memberRes.data.length > 0) {
            // 已是成员，跳过
            continue
          }

          // 检查散客记录是否已存在
          const casualRes = await db.collection('team_casuals')
            .where({ teamId: activity.teamId, openid: player.openid })
            .get()

          if (casualRes.data && casualRes.data.length > 0) {
            // 散客记录已存在，跳过
            continue
          }

          // 创建散客记录
          await db.collection('team_casuals').add({
            data: {
              teamId: activity.teamId,
              openid: player.openid,
              activityCount: 1,
              lastActivityId: activity._id,
              lastActivityName: activity.title,
              lastJoinedAt: db.serverDate(),
              createdAt: db.serverDate(),
              _fixNote: '自动修复：报名球队活动但缺失散客记录'
            }
          })

          results.totalCasualsFixed++
          console.log(`[fix] 修复散客记录: ${player.openid} -> ${activity.title}`)

        } catch (err) {
          results.errors.push({
            openid: player.openid,
            activityId: activity._id,
            error: err.message || String(err)
          })
        }
      }
    }

    return {
      success: true,
      message: `修复完成！共处理 ${results.totalActivities} 个活动，修复 ${results.totalCasualsFixed} 条散客记录`,
      results
    }

  } catch (err) {
    console.error('[fixMissingCasuals] 整体执行失败:', err)
    return { success: false, error: err.message, results }
  }
}
