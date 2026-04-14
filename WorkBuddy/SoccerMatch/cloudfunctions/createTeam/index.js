// cloudfunctions/createTeam/index.js
// 创建球队
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const { name, logoPath, coverPath, description, joinMethod } = event

  // 参数校验
  if (!name || !name.trim()) {
    return { success: false, error: 'NAME_REQUIRED', message: '球队名称不能为空' }
  }
  if (name.trim().length > 20) {
    return { success: false, error: 'NAME_TOO_LONG', message: '球队名称不能超过20字' }
  }
  if (description && description.length > 200) {
    return { success: false, error: 'DESC_TOO_LONG', message: '球队简介不能超过200字' }
  }
  if (!joinMethod || !['qrcode', 'apply'].includes(joinMethod)) {
    return { success: false, error: 'INVALID_JOIN_METHOD', message: '加入方式参数无效' }
  }

  try {
    const now = db.serverDate()
    console.log('[createTeam] 开始创建球队, openid:', openid, 'joinMethod:', joinMethod)

    // 创建球队记录
    const teamRes = await db.collection('teams').add({
      data: {
        name: name.trim(),
        logoPath: logoPath || '',
        coverPath: coverPath || '',
        description: description ? description.trim() : '',
        joinMethod,
        qrcodeUrl: '',
        creatorOpenid: openid,
        memberCount: 1,
        createdAt: now,
        updatedAt: now
      }
    })
    console.log('[createTeam] teams 写入成功, teamId:', teamRes._id)

    const teamId = teamRes._id

    // 同时写入 team_members（创建者为 creator）
    const memberRes = await db.collection('team_members').add({
      data: {
        teamId,
        openid,
        role: 'creator',
        joinedAt: now
      }
    })
    console.log('[createTeam] team_members 写入成功, memberId:', memberRes._id)

    // 查询返回完整球队数据
    const team = await db.collection('teams').doc(teamId).get()

    return {
      success: true,
      teamId,
      team: team.data
    }
  } catch (err) {
    console.error('[createTeam] error:', err)
    return { success: false, error: err.message }
  }
}
