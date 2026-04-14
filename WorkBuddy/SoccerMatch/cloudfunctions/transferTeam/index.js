// cloudfunctions/transferTeam/index.js
// 转让创建者身份给成员
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const { teamId, newCreatorOpenid } = event

  if (!teamId) {
    return { success: false, error: 'TEAM_ID_REQUIRED', message: '球队ID不能为空' }
  }
  if (!newCreatorOpenid) {
    return { success: false, error: 'NEW_CREATOR_REQUIRED', message: '新创建者openid不能为空' }
  }

  try {
    // 查询球队
    const teamRes = await db.collection('teams').doc(teamId).get()
    if (!teamRes.data) {
      return { success: false, error: 'TEAM_NOT_FOUND', message: '球队不存在' }
    }
    const team = teamRes.data

    // 权限检查：仅创建者可转让
    if (team.creatorOpenid !== openid) {
      return { success: false, error: 'NO_PERMISSION', message: '仅球队创建者可转让' }
    }
    if (newCreatorOpenid === openid) {
      return { success: false, error: 'CANNOT_TRANSFER_SELF', message: '不能转让给自己' }
    }

    // 查询当前创建者的成员记录
    const creatorMemberRes = await db.collection('team_members')
      .where({ teamId, openid })
      .get()

    if (!creatorMemberRes.data || creatorMemberRes.data.length === 0) {
      return { success: false, error: 'CREATOR_NOT_MEMBER', message: '创建者记录异常' }
    }

    // 查询新创建者的成员记录
    const newCreatorMemberRes = await db.collection('team_members')
      .where({ teamId, openid: newCreatorOpenid })
      .get()

    if (!newCreatorMemberRes.data || newCreatorMemberRes.data.length === 0) {
      return { success: false, error: 'NEW_CREATOR_NOT_MEMBER', message: '新创建者必须是球队成员' }
    }
    const newCreatorMember = newCreatorMemberRes.data[0]

    // 事务：更新球队创建者 + 更新两个成员的角色
    await db.collection('teams').doc(teamId).update({
      data: {
        creatorOpenid: newCreatorOpenid,
        updatedAt: db.serverDate()
      }
    })

    // 当前创建者降为管理员
    await db.collection('team_members').doc(creatorMemberRes.data[0]._id).update({
      data: { role: 'admin' }
    })

    // 新创建者升为创建者
    await db.collection('team_members').doc(newCreatorMember._id).update({
      data: { role: 'creator' }
    })

    return { success: true, message: '创建者身份已转让' }
  } catch (err) {
    console.error('transferTeam error:', err)
    return { success: false, error: err.message }
  }
}
