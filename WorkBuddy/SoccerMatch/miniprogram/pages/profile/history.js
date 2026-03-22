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
    loading: false,
    loadingMore: false,
    noMore: false,
    pageSize: 20,
    currentPage: 0
  },

  onLoad() {
    this.loadHistory(true)
  },

  onShow() {
    // 更新TabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({
      currentPage: 0,
      noMore: false,
      history: []
    })
    this.loadHistory(true).then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 上拉加载更多
  onReachBottom() {
    if (this.data.noMore || this.data.loadingMore) return
    this.loadHistory(false)
  },

  // 加载历史记录
  async loadHistory(isRefresh = false) {
    const openid = app.globalData.openid || wx.getStorageSync('openid')
    if (!openid) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    if (isRefresh) {
      this.setData({ loading: true })
    } else {
      this.setData({ loadingMore: true })
    }

    try {
      const { pageSize, currentPage, history } = this.data
      const skip = isRefresh ? 0 : history.length

      // 获取活动列表
      const res = await db.collection('activities')
        .orderBy('activityDate', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()

      const allActivities = res.data
      
      // 筛选出我参与的活动
      const myActivities = allActivities.filter(act => {
        const regs = act.registrations || []
        return regs.some(r => r.openid === openid)
      })

      // 如果没有更多数据了
      if (myActivities.length === 0 && !isRefresh) {
        this.setData({ noMore: true, loadingMore: false })
        return
      }

      // 计算统计数据（只在刷新时计算）
      let stats = isRefresh ? {
        totalGames: 0,
        confirmedCount: 0,
        pendingCount: 0,
        leaveCount: 0
      } : { ...this.data.myStats }

      const newHistory = myActivities.map(act => {
        const myReg = (act.registrations || []).find(r => r.openid === openid)
        const actDate = act.activityDate instanceof Date ? act.activityDate : new Date(act.activityDate)
        
        // 统计
        if (isRefresh) {
          if (myReg?.status === 'confirmed') { stats.confirmedCount++; stats.totalGames++ }
          if (myReg?.status === 'pending') stats.pendingCount++
          if (myReg?.status === 'leave') stats.leaveCount++
        }

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
          displayDate: this.formatDate(actDate)
        }
      })

      this.setData({
        history: isRefresh ? newHistory : [...history, ...newHistory],
        myStats: isRefresh ? stats : this.data.myStats,
        loading: false,
        loadingMore: false,
        currentPage: isRefresh ? 1 : currentPage + 1
      })

      // 如果获取的数据少于pageSize，说明没有更多了
      if (allActivities.length < pageSize) {
        this.setData({ noMore: true })
      }
    } catch (e) {
      console.error('加载历史失败', e)
      this.setData({ loading: false, loadingMore: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  formatDate(date) {
    const m = date.getMonth() + 1
    const d = date.getDate()
    return `${m}月${d}日`
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/activity/detail?id=${id}` })
  }
})