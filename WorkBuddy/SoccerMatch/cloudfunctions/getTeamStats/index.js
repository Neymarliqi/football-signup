// cloudfunctions/getTeamStats/index.js
// 查询球队数据（含时间筛选）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 分页查询辅助（突破默认100条限制）
async function getAll(collection, query) {
  let all = []
  let skip = 0
  const batch = 100
  while (true) {
    const res = await db.collection(collection).where(query).skip(skip).limit(batch).get()
    all = all.concat(res.data || [])
    if (res.data.length < batch) break
    skip += batch
  }
  return all
}

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

    // 2. 查询这些活动的 match_stats（分批查询）
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
    // 活动总数 = 所有非取消活动；比赛数 = 有比分记录的活动
    const totalActivities = activityIds.length
    const matchedActivityIds = new Set(allStats.map(s => s.activityId))
    const matchCount = matchedActivityIds.size

    let wins = 0, draws = 0, losses = 0
    allStats.forEach(s => {
      if (s.result === 'win') wins++
      else if (s.result === 'draw') draws++
      else if (s.result === 'lose') losses++
    })

    // 4. 按球员维度聚合：出勤/进球/助攻
    // 分页查询球队成员和散客（突破100条限制）
    const [members, casuals] = await Promise.all([
      getAll('team_members', { teamId }),
      getAll('team_casuals', { teamId })
    ])

    const memberOpenids = new Set((members || []).map(m => m.openid))
    const casualOpenids = new Set((casuals || []).map(c => c.openid))

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
      summary: { totalActivities, matchCount, wins, draws, losses },
      playerStats,
      activityIds
    }
  } catch (e) {
    console.error('getTeamStats error:', e)
    return { success: false, message: e.message || '查询失败' }
  }
}
