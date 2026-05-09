// cloudfunctions/getPersonalStats/index.js
// 查询个人数据（含时间筛选）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  // startDate / endDate 为 ISO 字符串，可选
  const { startDate, endDate } = event

  try {
    // 构建时间筛选条件
    let activityFilter = { 'registrations.openid': openid }
    if (startDate || endDate) {
      const dateFilter = {}
      if (startDate) dateFilter[_.gte(new Date(startDate))] = true
      if (endDate) dateFilter[_.lte(new Date(endDate))] = true
      // 重写 activityDate 过滤
      activityFilter = {
        'registrations.openid': openid,
        activityDate: (() => {
          const cond = {}
          if (startDate) Object.assign(cond, { [_.gte(new Date(startDate)).toString()]: true })
          // 用 db.command 正确写法
          if (startDate && endDate) return _.gte(new Date(startDate)).and(_.lte(new Date(endDate)))
          if (startDate) return _.gte(new Date(startDate))
          if (endDate) return _.lte(new Date(endDate))
        })()
      }
    }

    // 1. 查询该用户参与的所有活动
    const activitiesRes = await db.collection('activities')
      .where(activityFilter)
      .orderBy('activityDate', 'desc')
      .limit(200)
      .get()

    // 2. 从 match_stats 中拉取该用户的数据
    const activityIds = activitiesRes.data.map(a => a._id)

    let statsMap = {}
    if (activityIds.length > 0) {
      // 分批查询（每次最多20条）
      const batchSize = 20
      for (let i = 0; i < activityIds.length; i += batchSize) {
        const batch = activityIds.slice(i, i + batchSize)
        const statsRes = await db.collection('match_stats')
          .where({ activityId: _.in(batch) })
          .get()
        ;(statsRes.data || []).forEach(s => {
          statsMap[s.activityId] = s
        })
      }
    }

    // 3. 组装结果
    let totalGoals = 0
    let totalAssists = 0
    let totalAttended = 0

    const records = activitiesRes.data.map(act => {
      const myReg = (act.registrations || []).find(r => r.openid === openid)
      const stats = statsMap[act._id]
      const myStats = stats ? (stats.players || []).find(p => p.openid === openid) : null

      const attended = myStats ? myStats.attended : false
      const goals = myStats ? (myStats.goals || 0) : 0
      const assists = myStats ? (myStats.assists || 0) : 0

      if (attended) totalAttended++
      totalGoals += goals
      totalAssists += assists

      const actDate = act.activityDate instanceof Date ? act.activityDate : new Date(act.activityDate)

      return {
        activityId: act._id,
        title: act.title,
        activityDate: act.activityDate,
        displayDate: `${actDate.getMonth() + 1}月${actDate.getDate()}日`,
        myStatus: myReg ? myReg.status : null,
        attended,
        goals,
        assists,
        hasStats: !!stats
      }
    })

    return {
      success: true,
      summary: { totalGoals, totalAssists, totalAttended },
      records
    }
  } catch (e) {
    console.error('getPersonalStats error:', e)
    return { success: false, message: e.message || '查询失败' }
  }
}
