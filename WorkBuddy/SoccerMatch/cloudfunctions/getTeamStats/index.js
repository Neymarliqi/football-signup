// cloudfunctions/getTeamStats/index.js
// 查询球队数据（含时间筛选）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { teamId, startDate, endDate } = event

  if (!teamId) {
    return { success: false, message: '缺少 teamId' }
  }

  try {
    // 1. 查询球队的所有活动（排除已取消）
    let actFilter = { teamId, status: _.neq('cancelled') }
    if (startDate && endDate) {
      actFilter.activityDate = _.gte(new Date(startDate)).and(_.lte(new Date(endDate)))
    } else if (startDate) {
      actFilter.activityDate = _.gte(new Date(startDate))
    } else if (endDate) {
      actFilter.activityDate = _.lte(new Date(endDate))
    }

    const activitiesRes = await db.collection('activities')
      .where(actFilter)
      .orderBy('activityDate', 'desc')
      .limit(200)
      .get()

    const activityIds = activitiesRes.data.map(a => a._id)
    const totalActivities = activityIds.length

    // 2. 查询这些活动的 match_stats
    let allStats = []
    if (activityIds.length > 0) {
      const batchSize = 20
      for (let i = 0; i < activityIds.length; i += batchSize) {
        const batch = activityIds.slice(i, i + batchSize)
        const statsRes = await db.collection('match_stats')
          .where({ activityId: _.in(batch) })
          .get()
        allStats = allStats.concat(statsRes.data || [])
      }
    }

    // 3. 计算球队总览（胜/平/负）
    let wins = 0, draws = 0, losses = 0
    allStats.forEach(s => {
      if (s.result === 'win') wins++
      else if (s.result === 'draw') draws++
      else if (s.result === 'lose') losses++
    })

    // 4. 按球员维度聚合：出勤/进球/助攻
    // 同时查球队成员列表，区分 member/casual
    const [membersRes, casualsRes] = await Promise.all([
      db.collection('team_members').where({ teamId }).get(),
      db.collection('team_casuals').where({ teamId }).get()
    ])

    const memberOpenids = new Set((membersRes.data || []).map(m => m.openid))
    const casualOpenids = new Set((casualsRes.data || []).map(c => c.openid))

    // 统计所有球员数据
    const playerStatsMap = {}

    allStats.forEach(stats => {
      ;(stats.players || []).forEach(p => {
        if (!p.openid) return
        if (!playerStatsMap[p.openid]) {
          playerStatsMap[p.openid] = {
            openid: p.openid,
            attended: 0,
            goals: 0,
            assists: 0,
            type: memberOpenids.has(p.openid) ? 'member' : 'casual'
          }
        }
        if (p.attended === true) playerStatsMap[p.openid].attended++
        playerStatsMap[p.openid].goals += p.goals || 0
        playerStatsMap[p.openid].assists += p.assists || 0
      })
    })

    const playerStats = Object.values(playerStatsMap)

    return {
      success: true,
      summary: { totalNormalActivities: totalActivities, wins, draws, losses },
      playerStats,
      activityIds
    }
  } catch (e) {
    console.error('getTeamStats error:', e)
    return { success: false, message: e.message || '查询失败' }
  }
}
