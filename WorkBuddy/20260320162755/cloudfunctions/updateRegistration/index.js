// cloudfunctions/updateRegistration/index.js
// 更新报名状态（报名/待定/请假）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const { activityId, status, leaveReason, nickName, avatarUrl, position } = event

  try {
    // 获取活动
    const actRes = await db.collection('activities').doc(activityId).get()
    const activity = actRes.data
    const registrations = activity.registrations || []

    // 检查是否已报名
    const existingIndex = registrations.findIndex(r => r.openid === openid)

    // 报名满员检查（仅 confirmed 状态）
    if (status === 'confirmed') {
      const confirmedCount = registrations.filter(r => r.status === 'confirmed').length
      // 如果原来是 confirmed，不算新增
      const wasConfirmed = existingIndex >= 0 && registrations[existingIndex].status === 'confirmed'
      if (!wasConfirmed && confirmedCount >= activity.maxPlayers) {
        return { success: false, error: 'FULL', message: '报名人数已满' }
      }
    }

    const registerRecord = {
      openid,
      nickName: nickName || '队员',
      avatarUrl: avatarUrl || '',
      position: position || '',
      status,
      leaveReason: leaveReason || '',
      registerTime: db.serverDate()
    }

    let newRegistrations
    if (existingIndex >= 0) {
      // 更新已有记录
      newRegistrations = [...registrations]
      newRegistrations[existingIndex] = { ...registrations[existingIndex], ...registerRecord }
    } else {
      // 新增记录
      newRegistrations = [...registrations, registerRecord]
    }

    await db.collection('activities').doc(activityId).update({
      data: { registrations: newRegistrations, updatedAt: db.serverDate() }
    })

    return { success: true, message: '操作成功' }
  } catch (err) {
    console.error('updateRegistration error:', err)
    return { success: false, error: err.message }
  }
}
