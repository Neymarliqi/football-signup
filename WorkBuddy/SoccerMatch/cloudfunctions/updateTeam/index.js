// cloudfunctions/updateTeam/index.js
// 更新球队信息（名称/简介/封面/Logo）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const { teamId, name, logoPath, coverPath, description } = event

  if (!teamId) {
    return { success: false, error: 'TEAM_ID_REQUIRED', message: '球队ID不能为空' }
  }

  try {
    // 查询球队
    const teamRes = await db.collection('teams').doc(teamId).get()
    if (!teamRes.data) {
      return { success: false, error: 'TEAM_NOT_FOUND', message: '球队不存在' }
    }
    const team = teamRes.data

    // 权限检查：仅创建者可修改
    if (team.creatorOpenid !== openid) {
      return { success: false, error: 'NO_PERMISSION', message: '仅球队创建者可修改球队信息' }
    }

    // 参数校验
    if (name !== undefined) {
      if (!name.trim()) {
        return { success: false, error: 'NAME_REQUIRED', message: '球队名称不能为空' }
      }
      if (name.trim().length > 20) {
        return { success: false, error: 'NAME_TOO_LONG', message: '球队名称不能超过20字' }
      }
    }
    if (description !== undefined && description.length > 200) {
      return { success: false, error: 'DESC_TOO_LONG', message: '球队简介不能超过200字' }
    }

    // 构建更新字段
    const updateData = { updatedAt: db.serverDate() }
    if (name !== undefined) updateData.name = name.trim()
    if (logoPath !== undefined) updateData.logoPath = logoPath
    if (coverPath !== undefined) updateData.coverPath = coverPath
    if (description !== undefined) updateData.description = description.trim()

    await db.collection('teams').doc(teamId).update({ data: updateData })

    // 返回更新后的数据
    const updated = await db.collection('teams').doc(teamId).get()

    return { success: true, team: updated.data }
  } catch (err) {
    console.error('updateTeam error:', err)
    return { success: false, error: err.message }
  }
}
