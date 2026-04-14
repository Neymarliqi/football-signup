// cloudfunctions/updateTeamMember/index.js
// 更新成员：设置管理员 / 移除成员 / 一键转入散客
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const { teamId, action, targetOpenid, casualOpenids } = event
  // action: 'setAdmin' | 'removeMember' | 'convertCasuals'

  if (!teamId) {
    return { success: false, error: 'TEAM_ID_REQUIRED', message: '球队ID不能为空' }
  }
  if (!action) {
    return { success: false, error: 'ACTION_REQUIRED', message: '操作类型不能为空' }
  }

  try {
    // 查询球队
    const teamRes = await db.collection('teams').doc(teamId).get()
    if (!teamRes.data) {
      return { success: false, error: 'TEAM_NOT_FOUND', message: '球队不存在' }
    }
    const team = teamRes.data

    // 查询操作者的成员记录
    const myMemberRes = await db.collection('team_members')
      .where({ teamId, openid })
      .get()

    if (!myMemberRes.data || myMemberRes.data.length === 0) {
      return { success: false, error: 'NOT_MEMBER', message: '您不是球队成员' }
    }
    const myRole = myMemberRes.data[0].role

    // 仅创建者可操作
    if (myRole !== 'creator') {
      return { success: false, error: 'NO_PERMISSION', message: '仅球队创建者可操作成员' }
    }

    const now = db.serverDate()

    // ========== setAdmin：设置/取消管理员 ==========
    if (action === 'setAdmin') {
      if (!targetOpenid) {
        return { success: false, error: 'TARGET_REQUIRED', message: '目标用户openid不能为空' }
      }
      if (targetOpenid === openid) {
        return { success: false, error: 'CANNOT_SET_SELF', message: '不能对自己进行此操作' }
      }

      const targetMemberRes = await db.collection('team_members')
        .where({ teamId, openid: targetOpenid })
        .get()

      if (!targetMemberRes.data || targetMemberRes.data.length === 0) {
        return { success: false, error: 'TARGET_NOT_MEMBER', message: '目标用户不是球队成员' }
      }
      const targetMember = targetMemberRes.data[0]
      const newRole = targetMember.role === 'admin' ? 'member' : 'admin'

      await db.collection('team_members').doc(targetMember._id).update({
        data: { role: newRole }
      })

      return { success: true, message: newRole === 'admin' ? '已设为管理员' : '已取消管理员' }
    }

    // ========== removeMember：移除成员 ==========
    if (action === 'removeMember') {
      if (!targetOpenid) {
        return { success: false, error: 'TARGET_REQUIRED', message: '目标用户openid不能为空' }
      }
      if (targetOpenid === openid) {
        return { success: false, error: 'CANNOT_REMOVE_SELF', message: '不能移除自己' }
      }

      const targetMemberRes = await db.collection('team_members')
        .where({ teamId, openid: targetOpenid })
        .get()

      if (!targetMemberRes.data || targetMemberRes.data.length === 0) {
        return { success: false, error: 'TARGET_NOT_MEMBER', message: '目标用户不是球队成员' }
      }
      const targetMember = targetMemberRes.data[0]

      if (targetMember.role === 'creator') {
        return { success: false, error: 'CANNOT_REMOVE_CREATOR', message: '不能移除创建者' }
      }

      // 删除成员记录
      await db.collection('team_members').doc(targetMember._id).remove()

      // memberCount -1
      await db.collection('teams').doc(teamId).update({
        data: { memberCount: db.command.inc(-1), updatedAt: now }
      })

      return { success: true, message: '已移除该成员' }
    }

    // ========== convertCasuals：一键转入散客为队员 ==========
    if (action === 'convertCasuals') {
      if (!casualOpenids || !Array.isArray(casualOpenids) || casualOpenids.length === 0) {
        return { success: false, error: 'NO_CASUALS', message: '请选择要转入的散客' }
      }

      const results = { added: 0, skipped: 0 }

      for (const casualOpenid of casualOpenids) {
        // 检查是否已是成员
        const existingRes = await db.collection('team_members')
          .where({ teamId, openid: casualOpenid })
          .get()

        if (existingRes.data && existingRes.data.length > 0) {
          results.skipped++
          continue
        }

        // 写入 team_members
        await db.collection('team_members').add({
          data: {
            teamId,
            openid: casualOpenid,
            role: 'member',
            joinedAt: now
          }
        })

        // memberCount +1
        await db.collection('teams').doc(teamId).update({
          data: { memberCount: db.command.inc(1) }
        })

        // 从 team_casuals 删除
        await db.collection('team_casuals')
          .where({ teamId, openid: casualOpenid })
          .remove()

        results.added++
      }

      await db.collection('teams').doc(teamId).update({
        data: { updatedAt: now }
      })

      return {
        success: true,
        message: `已转入 ${results.added} 人${results.skipped > 0 ? `（${results.skipped} 人已是成员）` : ''}`
      }
    }

    return { success: false, error: 'UNKNOWN_ACTION', message: '未知操作类型' }
  } catch (err) {
    console.error('updateTeamMember error:', err)
    return { success: false, error: err.message }
  }
}
