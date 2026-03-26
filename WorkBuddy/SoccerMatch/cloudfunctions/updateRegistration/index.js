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

    // 检查活动状态是否允许报名
    const now = new Date()
    const actDate = activity.activityDate instanceof Date ? activity.activityDate : new Date(activity.activityDate)
    if (activity.status === 'finished' || actDate < now) {
      return { success: false, error: 'ACTIVITY_ENDED', message: '活动已结束，无法报名' }
    }
    if (activity.status === 'cancelled') {
      return { success: false, error: 'ACTIVITY_CANCELLED', message: '活动已取消，无法报名' }
    }

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

    // 同步用户信息到 users 集合（仅在用户不存在时创建，已存在时不覆盖头像昵称）
    try {
      const userRes = await db.collection('users').doc(openid).get()
      if (userRes.data) {
        // 用户已存在，不更新 nickName 和 avatarUrl（保留用户在编辑资料页设置的值）
        // 注意：不更新 positions，因为前端传的是报名位置字符串，不是 users 表的对象数组格式
      } else {
        // 用户不存在，创建新记录（首次报名）
        await db.collection('users').doc(openid).set({
          data: {
            openid: openid,
            nickName: nickName || '队员',
            avatarUrl: avatarUrl || '',
            positions: [],
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        })
      }
    } catch (userErr) {
      // 记录不存在（get 会抛错），创建新记录
      if (userErr.errCode === -502001 || userErr.errCode === -502005) {
        try {
          await db.collection('users').doc(openid).set({
            data: {
              openid: openid,
              nickName: nickName || '队员',
              avatarUrl: avatarUrl || '',
              positions: [],
              createdAt: db.serverDate(),
              updatedAt: db.serverDate()
            }
          })
        } catch (setErr) {
          console.error('[updateRegistration] 创建用户记录失败:', setErr)
        }
      } else {
        console.error('[updateRegistration] 同步用户信息失败:', userErr)
      }
      // 不影响报名主流程
    }

    return { success: true, message: '操作成功' }
  } catch (err) {
    console.error('updateRegistration error:', err)
    return { success: false, error: err.message }
  }
}
