// cloudfunctions/getTeamApplications/index.js
// 获取球队待审批申请列表
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { teamId } = event

  if (!teamId) {
    return { success: false, message: '缺少 teamId' }
  }

  try {
    // 验证操作者身份（必须是创建者或管理员）
    const memberRes = await db.collection('team_members')
      .where({ teamId, openid })
      .get()

    let isCreator = false

    if (!memberRes.data || memberRes.data.length === 0) {
      // team_members 为空，检查是否是球队创建者
      const teamRes = await db.collection('teams').doc(teamId).get()
      if (teamRes.data && teamRes.data.creatorOpenid === openid) {
        isCreator = true
      } else {
        return { success: false, message: '您不是球队成员' }
      }
    } else {
      const myRole = memberRes.data[0].role
      if (myRole !== 'creator' && myRole !== 'admin') {
        return { success: false, message: '只有管理员可以查看申请' }
      }
    }

    // 只查询 pending 状态的申请
    const applicationsRes = await db.collection('team_applications')
      .where({ teamId, status: 'pending' })
      .orderBy('appliedAt', 'desc')
      .get()

    return {
      success: true,
      applications: applicationsRes.data || []
    }
  } catch (err) {
    console.error('getTeamApplications error:', err)
    return { success: false, message: err.message }
  }
}
