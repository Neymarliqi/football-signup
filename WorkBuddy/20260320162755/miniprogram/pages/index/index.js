// pages/index/index.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    activities: [],
    announcements: [],
    activeFilter: 'all',
    isAdmin: false,
    loading: true
  },

  onLoad() {
    this.setData({ isAdmin: app.globalData.isAdmin })
  },

  onShow() {
    this.loadAnnouncements()
    this.loadActivities()
    // 刷新管理员状态
    this.setData({ isAdmin: app.globalData.isAdmin })
  },

  // 加载公告
  async loadAnnouncements() {
    try {
      const res = await db.collection('announcements')
        .where({ active: true })
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get()
      this.setData({ announcements: res.data })
    } catch (e) {
      console.error('加载公告失败', e)
    }
  },

  // 加载活动列表
  async loadActivities() {
    this.setData({ loading: true })
    try {
      const openid = app.globalData.openid || wx.getStorageSync('openid')
      const filter = this.data.activeFilter
      const now = new Date()

      let query = db.collection('activities')

      if (filter === 'upcoming') {
        query = query.where({ activityDate: db.command.gt(now), status: 'open' })
      } else if (filter === 'ongoing') {
        query = query.where({ status: 'ongoing' })
      } else if (filter === 'finished') {
        query = query.where({ status: 'finished' })
      }

      const res = await query
        .orderBy('activityDate', 'asc')
        .limit(20)
        .get()

      const activities = res.data.map(act => this.formatActivity(act, openid))
      this.setData({ activities, loading: false })
    } catch (e) {
      console.error('加载活动失败', e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败，请重试', icon: 'none' })
    }
  },

  // 格式化活动数据
  formatActivity(act, openid) {
    const registrations = act.registrations || []
    const confirmed = registrations.filter(r => r.status === 'confirmed')
    const pending = registrations.filter(r => r.status === 'pending')
    const leave = registrations.filter(r => r.status === 'leave')
    const myReg = registrations.find(r => r.openid === openid)

    // 进度百分比
    const percent = Math.min((confirmed.length / act.maxPlayers) * 100, 100)

    // 活动日期格式化
    const actDate = act.activityDate instanceof Date ? act.activityDate : new Date(act.activityDate)
    const displayDate = this.formatDate(actDate)

    // 状态
    const now = new Date()
    let statusText, statusClass
    if (act.status === 'finished' || actDate < now) {
      statusText = '已结束'; statusClass = 'tag-gray'
    } else if (act.status === 'ongoing') {
      statusText = '进行中'; statusClass = 'tag-blue'
    } else if (act.status === 'cancelled') {
      statusText = '已取消'; statusClass = 'tag-red'
    } else {
      statusText = '报名中'; statusClass = 'tag-green'
    }

    // 我的状态
    let myStatus = null, myStatusText = '', myStatusClass = ''
    if (myReg) {
      myStatus = myReg.status
      const statusMap = {
        confirmed: { text: '✅ 已报名', cls: 'tag-green' },
        pending: { text: '⏳ 待定', cls: 'tag-yellow' },
        leave: { text: '🙅 请假', cls: 'tag-red' }
      }
      myStatusText = statusMap[myReg.status]?.text || ''
      myStatusClass = statusMap[myReg.status]?.cls || ''
    }

    // 显示前8人头像
    const confirmedPlayers = confirmed.slice(0, 8).map(r => ({
      ...r,
      shortName: r.nickName ? r.nickName.slice(0, 3) : '队员'
    }))

    return {
      ...act,
      confirmedCount: confirmed.length,
      pendingCount: pending.length,
      leaveCount: leave.length,
      confirmedPlayers,
      progressPercent: Math.round(percent),
      displayDate,
      statusText,
      statusClass,
      myStatus,
      myStatusText,
      myStatusClass
    }
  },

  formatDate(date) {
    const m = date.getMonth() + 1
    const d = date.getDate()
    const weekdays = ['日', '一', '二', '三', '四', '五', '六']
    const w = weekdays[date.getDay()]
    return `${m}月${d}日（周${w}）`
  },

  setFilter(e) {
    const type = e.currentTarget.dataset.type
    this.setData({ activeFilter: type }, () => {
      this.loadActivities()
    })
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/activity/detail?id=${id}` })
  },

  goTactics(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/tactics/tactics?activityId=${id}` })
  },

  goAdmin() {
    wx.navigateTo({ url: '/pages/admin/admin' })
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/activity/create' })
  }
})
