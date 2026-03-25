// utils/format.js - 公共格式化函数

/**
 * 格式化日期 - 统一格式：3月25日（周三）
 * @param {Date|string} date - 日期对象或字符串
 * @param {boolean} includeWeekday - 是否包含星期（默认true）
 * @returns {string} 格式化后的日期字符串
 */
export function formatDate(date, includeWeekday = true) {
  const d = date instanceof Date ? date : new Date(date)
  const m = d.getMonth() + 1
  const day = d.getDate()

  if (!includeWeekday) {
    return `${m}月${day}日`
  }

  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const w = weekdays[d.getDay()]
  return `${m}月${day}日（周${w}）`
}

/**
 * 格式化日期和时间 - 格式：2026年3月25日 14:30
 * @param {Date|string} date - 日期对象或字符串
 * @returns {string} 格式化后的日期时间字符串
 */
export function formatDateTime(date) {
  const d = date instanceof Date ? date : new Date(date)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}年${m}月${day}日 ${h}:${min}`
}

/**
 * 格式化时间 - 格式：14:30
 * @param {Date|string} date - 日期对象或字符串
 * @returns {string} 格式化后的时间字符串
 */
export function formatTime(date) {
  const d = date instanceof Date ? date : new Date(date)
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${min}`
}

/**
 * 获取位置中文名称（取前2个字）
 * @param {string} positionCode - 位置代码（如 'CM', 'GK'）
 * @param {object} positionMap - 位置映射表（默认使用全局POSITION_MAP）
 * @returns {string} 中文名称（如 '中场'）
 */
export function getPositionLabel(positionCode, positionMap = null) {
  const map = positionMap || require('./constants').POSITION_MAP
  const label = map[positionCode.trim().toUpperCase()] || positionCode.trim()
  return label.substring(0, 2) // 只显示前2个字
}

/**
 * 获取首选位置（从positions数组中查找order=1）
 * @param {Array|string} positions - 位置数组或字符串
 * @param {object} positionMap - 位置映射表（默认使用全局POSITION_MAP）
 * @returns {string|null} 首选位置代码，如 'CM'；无位置返回null
 */
export function getFirstPositionCode(positions, positionMap = null) {
  if (!positions) return null

  let firstPosCode = ''

  if (typeof positions === 'string') {
    // 旧格式：逗号分隔的字符串
    const posArray = positions.split(/[,，\/\s]+/).filter(p => p.trim())
    firstPosCode = posArray[0]
  } else if (Array.isArray(positions)) {
    // 新格式：数组，查找order=1
    const firstPosItem = positions.find(p =>
      typeof p === 'object' ? p.order === 1 : positions.indexOf(p) === 0
    )
    firstPosCode = typeof firstPosItem === 'object' ? firstPosItem.value : firstPosItem
  }

  return firstPosCode || null
}

/**
 * 格式化用户位置标签（头像上显示的文字）
 * @param {Array|string} positions - 位置数组或字符串
 * @param {object} positionMap - 位置映射表（默认使用全局POSITION_MAP）
 * @returns {string} 位置标签（如 '中场'），无位置返回空字符串
 */
export function formatUserPosition(positions, positionMap = null) {
  const firstPosCode = getFirstPositionCode(positions, positionMap)
  if (!firstPosCode) return ''

  const map = positionMap || require('./constants').POSITION_MAP
  const chinesePosition = map[firstPosCode.trim().toUpperCase()] || firstPosCode.trim()
  return chinesePosition.substring(0, 2) // 只显示前2个字
}

/**
 * 格式化报名状态文字和样式类
 * @param {string} status - 状态（confirmed/pending/leave）
 * @param {object} statusMap - 状态映射表（默认使用全局STATUS_MAP）
 * @returns {object} { text, cls }
 */
export function formatStatus(status, statusMap = null) {
  const map = statusMap || require('./constants').STATUS_MAP
  return map[status] || { text: '', cls: '' }
}
