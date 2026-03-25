// utils/request.js - 公共请求函数

const { RETRY_CONFIG, DB_LIMITS } = require('./constants')

/**
 * 带重试机制的通用请求方法
 * @param {Function} requestFn - 请求函数
 * @param {number} maxRetries - 最大重试次数（默认3次）
 * @param {number} delay - 初始延迟时间（默认1000ms）
 * @returns {Promise} 请求结果
 */
export async function requestWithRetry(requestFn, maxRetries = RETRY_CONFIG.maxRetries, delay = RETRY_CONFIG.delay) {
  let lastError
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await requestFn()
    } catch (e) {
      lastError = e
      console.log(`[requestWithRetry] 请求失败，第${i + 1}次重试...`, e)
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)))
      }
    }
  }
  throw lastError
}

/**
 * 批量获取用户信息（分批查询，每批最多20个）
 * @param {Array<string>} userIds - 用户ID数组
 * @param {object} db - 数据库实例
 * @returns {Promise<object>} 用户信息映射 { openid: userData }
 */
export async function batchGetUsers(userIds, db) {
  const result = {}
  if (userIds.length === 0) return result

  try {
    const batchSize = DB_LIMITS.USERS_BATCH
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize)
      const usersRes = await requestWithRetry(() =>
        db.collection('users').where({ openid: db.command.in(batch) }).get()
      )
      usersRes.data.forEach(u => {
        result[u.openid] = u
      })
    }
  } catch (e) {
    console.error('[batchGetUsers] 获取用户信息失败', e)
  }

  return result
}

/**
 * 格式化活动数据（首页/历史页面通用）
 * @param {object} act - 原始活动数据
 * @param {string} openid - 当前用户openid
 * @param {object} latestUsers - 最新用户信息映射
 * @returns {object} 格式化后的活动数据
 */
export function formatActivity(act, openid, latestUsers = {}) {
  const registrations = act.registrations || []
  const confirmed = registrations.filter(r => r.status === 'confirmed')
  const pending = registrations.filter(r => r.status === 'pending')
  const leave = registrations.filter(r => r.status === 'leave')
  const myReg = registrations.find(r => r.openid === openid)

  // 进度百分比
  const percent = Math.min((confirmed.length / act.maxPlayers) * 100, 100)

  // 格式化日期
  const actDate = act.activityDate instanceof Date ? act.activityDate : new Date(act.activityDate)
  const displayDate = formatDate(actDate)

  // 判断是否是发布者
  const isCreator = act.createdBy === openid

  // 状态判断
  const now = new Date()
  let statusText, statusClass, canEdit, canCancel, canDelete
  if (act.status === 'finished' || actDate < now) {
    statusText = '已结束'; statusClass = 'tag-gray'
    canEdit = false; canCancel = false; canDelete = isCreator
  } else if (act.status === 'ongoing') {
    statusText = '进行中'; statusClass = 'tag-blue'
    canEdit = false; canCancel = false; canDelete = false
  } else if (act.status === 'cancelled') {
    statusText = '已取消'; statusClass = 'tag-red'
    canEdit = false; canCancel = false; canDelete = isCreator
  } else {
    statusText = '报名中'; statusClass = 'tag-green'
    canEdit = isCreator; canCancel = isCreator; canDelete = false
  }

  // 我的状态
  let myStatus = null, myStatusText = '', myStatusClass = ''
  if (myReg) {
    const statusInfo = formatStatus(myReg.status)
    myStatus = myReg.status
    myStatusText = statusInfo.text
    myStatusClass = statusInfo.cls
  }

  // 确保所有字段都有默认值
  const actWithDefaults = {
    title: '',
    description: '',
    matchType: '',
    time: '',
    locationName: '',
    location: '',
    fieldType: '人工草',
    maxPlayers: 16,
    fee: 0,
    notice: '',
    allowPending: true,
    ...act
  }

  return {
    ...actWithDefaults,
    confirmedCount: confirmed.length,
    pendingCount: pending.length,
    leaveCount: leave.length,
    progressPercent: Math.round(percent),
    displayDate,
    statusText,
    statusClass,
    isCreator,
    canEdit,
    canCancel,
    canDelete,
    myStatus,
    myStatusText,
    myStatusClass
  }
}
