// pages/profile/history.js
const app = getApp()
const db = wx.cloud.database()

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

      // 获取活动
      const res = await db.collection('activities')
        .orderBy('activityDate', 'desc')
        .skip(page * pageSize)
        .limit(pageSize)
        .get()

      const activities = res.data
      
      // 筛选出我参与的活动
      const myActivities = activities.filter(act => {
        const regs = act.registrations || []
        return regs.some(r => r.openid === openid)
      })

      // 处理数据
      const newHistory = myActivities.map(act => {
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

  // 计算统计数据
  async calculateStats(openid) {
    try {
      const res = await db.collection('activities').get()
      const allActivities = res.data
      
      const myActivities = allActivities.filter(act => {
        const regs = act.registrations || []
        return regs.some(r => r.openid === openid)
      })

      let totalGames = 0, confirmedCount = 0, pendingCount = 0, leaveCount = 0

      myActivities.forEach(act => {
        const myReg = (act.registrations || []).find(r => r.openid === openid)
        if (myReg?.status === 'confirmed') { confirmedCount++; totalGames++ }
        if (myReg?.status === 'pending') pendingCount++
        if (myReg?.status === 'leave') leaveCount++
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
