// pages/profile/history.js
const app = getApp()
const db = wx.cloud.database()
const _ = db.command
const $ = db.command.aggregate

Page({
  data: {
    history: [],
    myStats: {
      totalGames: 0,
      confirmedCount: 0,
      pendingCount: 0,
      leaveCount: 0
    },
    pageSize: 20,
    currentPage: 0,
    hasMore: true,
    isLoading: false,
    isRefreshing: false
  },

  onLoad() {
    this.loadHistory(true)
  },

  onPullDownRefresh() {
    this.setData({ isRefreshing: true })
    this.loadHistory(true).then(() => {
      this.setData({ isRefreshing: false })
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.loadHistory(false)
    }
  },

  // 加载历史记录
  async loadHistory(isRefresh = false) {
    if (this.data.isLoading) return

    const openid = app.globalData.openid || wx.getStorageSync('openid')
    if (!openid) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    this.setData({ isLoading: true })

    try {
      const page = isRefresh ? 0 : this.data.currentPage + 1
      const pageSize = this.data.pageSize

      // 服务端过滤：只查询我参与的活动（点表示法查询嵌套数组字段）
      const res = await db.collection('activities')
        .where({
          'registrations.openid': openid
        })
        .orderBy('activityDate', 'desc')
        .skip(page * pageSize)
        .limit(pageSize)
        .get()

      const activities = res.data

      // 处理数据
      const newHistory = activities.map(act => {
        const myReg = (act.registrations || []).find(r => r.openid === openid)
        const actDate = act.activityDate instanceof Date ? act.activityDate : new Date(act.activityDate)

        const statusMap = {
          confirmed: { text: '✅ 报名', cls: 'tag-green' },
          pending: { text: '⏳ 待定', cls: 'tag-yellow' },
          leave: { text: '🙅 请假', cls: 'tag-red' }
        }

        return {
          ...act,
          myStatus: myReg?.status,
          myStatusText: statusMap[myReg?.status]?.text || '',
          myStatusClass: statusMap[myReg?.status]?.cls || '',
          displayDate: this.formatDate(actDate),
          displayTime: this.formatTime(actDate)
        }
      })

      // 合并数据
      const history = isRefresh ? newHistory : [...this.data.history, ...newHistory]
      const hasMore = activities.length === pageSize

      // 如果是刷新，重新计算统计数据
      let myStats = this.data.myStats
      if (isRefresh) {
        myStats = await this.calculateStats(openid)
      }

      this.setData({
        history,
        currentPage: page,
        hasMore,
        myStats,
        isLoading: false
      })
    } catch (e) {
      console.error('加载历史失败', e)
      this.setData({ isLoading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // 计算统计数据（聚合查询，服务端计算）
  async calculateStats(openid) {
    try {
      const res = await db.collection('activities')
        .aggregate()
        .match({
          'registrations.openid': openid
        })
        .project({
          myRegs: $.filter({
            input: '$registrations',
            as: 'r',
            cond: $.eq(['$$r.openid', openid])
          })
        })
        .project({
          myStatus: $.arrayElemAt(['$myRegs', 0])
        })
        .project({
          status: '$myStatus.status'
        })
        .end()

      const records = res.list || []
      let totalGames = 0, confirmedCount = 0, pendingCount = 0, leaveCount = 0

      records.forEach(r => {
        const status = r.status
        if (status === 'confirmed') { confirmedCount++; totalGames++ }
        else if (status === 'pending') pendingCount++
        else if (status === 'leave') leaveCount++
      })

      return { totalGames, confirmedCount, pendingCount, leaveCount }
    } catch (e) {
      console.error('计算统计失败', e)
      return { totalGames: 0, confirmedCount: 0, pendingCount: 0, leaveCount: 0 }
    }
  },

  formatDate(date) {
    const y = date.getFullYear()
    const m = date.getMonth() + 1
    const d = date.getDate()
    return `${y}年${m}月${d}日`
  },

  formatTime(date) {
    const h = date.getHours().toString().padStart(2, '0')
    const min = date.getMinutes().toString().padStart(2, '0')
    return `${h}:${min}`
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/activity/detail?id=${id}` })
  }
})
