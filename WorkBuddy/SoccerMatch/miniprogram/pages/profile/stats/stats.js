// pages/profile/stats/stats.js
// 个人数据页
const app = getApp()

Page({
  data: {
    // 筛选
    filterOptions: [
      { label: '全部', value: 'all' },
      { label: '本年', value: 'year' },
      { label: '本季度', value: 'quarter' },
      { label: '本月', value: 'month' }
    ],
    activeFilter: 'all',
    // 汇总
    summary: { totalGoals: 0, totalAssists: 0, totalAttended: 0 },
    // 明细记录
    records: [],
    loading: true
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '我的数据' })
    this.loadStats()
  },

  // 切换筛选
  switchFilter(e) {
    const val = e.currentTarget.dataset.value
    if (val === this.data.activeFilter) return
    this.setData({ activeFilter: val })
    this.loadStats()
  },

  // 计算时间范围
  getDateRange(filter) {
    const now = new Date()
    let startDate = null
    let endDate = null

    if (filter === 'year') {
      startDate = new Date(now.getFullYear(), 0, 1).toISOString()
      endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59).toISOString()
    } else if (filter === 'quarter') {
      const q = Math.floor(now.getMonth() / 3)
      startDate = new Date(now.getFullYear(), q * 3, 1).toISOString()
      endDate = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59).toISOString()
    } else if (filter === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()
    }

    return { startDate, endDate }
  },

  async loadStats() {
    this.setData({ loading: true })
    try {
      const { activeFilter } = this.data
      const { startDate, endDate } = this.getDateRange(activeFilter)

      const res = await wx.cloud.callFunction({
        name: 'getPersonalStats',
        data: { startDate, endDate }
      })

      if (res.result && res.result.success) {
        this.setData({
          summary: res.result.summary,
          records: res.result.records || [],
          loading: false
        })
      } else {
        this.setData({ loading: false })
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
    } catch (e) {
      console.error('loadStats error', e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/activity/detail?id=${id}` })
  }
})
