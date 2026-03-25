// miniprogram/utils/constants.js
// 常量定义和通用工具函数

// 位置代码映射表（完整版）
export const POSITION_MAP = {
  'ALL': '全能 ALL',
  'GK': '守门员 GK',
  'LB': '左后卫 LB',
  'CB': '中后卫 CB',
  'RB': '右后卫 RB',
  'LWB': '左翼卫 LWB',
  'RWB': '右翼卫 RWB',
  'CDM': '后腰 CDM',
  'CM': '中场 CM',
  'LM': '左中场 LM',
  'RM': '右中场 RM',
  'CAM': '前腰 CAM',
  'LW': '左边锋 LW',
  'RW': '右边锋 RW',
  'ST': '中锋 ST',
  'CF': '前锋 CF'
}

// 状态映射表（活动状态）
export const ACTIVITY_STATUS_MAP = {
  'open': '报名中',
  'ongoing': '进行中',
  'finished': '已结束',
  'cancelled': '已取消'
}

// 状态样式类
export const ACTIVITY_STATUS_CLASS = {
  'open': 'tag-green',
  'ongoing': 'tag-blue',
  'finished': 'tag-gray',
  'cancelled': 'tag-red'
}

// 报名状态映射表
export const REGISTRATION_STATUS_MAP = {
  'confirmed': { text: '✅ 已报名', cls: 'tag-green' },
  'pending': { text: '⏳ 待定', cls: 'tag-yellow' },
  'leave': { text: '🙅 请假', cls: 'tag-red' }
}

// 默认头像
export const DEFAULT_AVATAR = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'

// 获取位置标签（完整版）
export function getPositionLabel(positionCode) {
  return POSITION_MAP[positionCode?.toUpperCase()] || positionCode || ''
}

// 获取位置标签（短版本，只取前2个字）
export function getPositionLabelShort(positionCode) {
  const fullLabel = getPositionLabel(positionCode)
  return fullLabel.substring(0, 2) || ''
}

// 获取活动状态文本
export function getActivityStatusText(status) {
  return ACTIVITY_STATUS_MAP[status] || '未知'
}

// 获取活动状态样式类
export function getActivityStatusClass(status) {
  return ACTIVITY_STATUS_CLASS[status] || ''
}

// 获取报名状态信息
export function getRegistrationStatusInfo(status) {
  return REGISTRATION_STATUS_MAP[status] || { text: '', cls: '' }
}

// 获取首选位置代码（从positions数组或字符串中提取order=1的位置）
export function getFirstPositionCode(positions) {
  if (!positions) return ''
  
  let firstPosCode = ''
  if (typeof positions === 'string') {
    // 旧格式：逗号分隔的字符串
    const positionArray = positions.split(/[,，\/\s]+/).filter(p => p.trim())
    firstPosCode = positionArray[0]
  } else if (Array.isArray(positions)) {
    // 新格式：数组，查找order=1
    const firstPosItem = positions.find(p => 
      typeof p === 'object' ? p.order === 1 : positions.indexOf(p) === 0
    )
    firstPosCode = typeof firstPosItem === 'object' 
      ? firstPosItem.value 
      : firstPosItem
  }
  
  return firstPosCode?.trim().toUpperCase() || ''
}

// 获取首选位置标签（中文，短版本）
export function getFirstPositionLabel(positions) {
  const firstPosCode = getFirstPositionCode(positions)
  if (!firstPosCode) return ''
  
  const fullLabel = POSITION_MAP[firstPosCode] || firstPosCode
  return fullLabel.substring(0, 2)
}

// 导出所有常量和函数
export default {
  POSITION_MAP,
  ACTIVITY_STATUS_MAP,
  ACTIVITY_STATUS_CLASS,
  REGISTRATION_STATUS_MAP,
  DEFAULT_AVATAR,
  getPositionLabel,
  getPositionLabelShort,
  getActivityStatusText,
  getActivityStatusClass,
  getRegistrationStatusInfo,
  getFirstPositionCode,
  getFirstPositionLabel
}
