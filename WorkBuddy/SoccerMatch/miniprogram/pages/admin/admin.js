// pages/admin/admin.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    activities: [],
    announcements: [],
    members: [],
    showAnnouncementModal: false,
    newAnnouncement: ''
  },

  onLoad() {
    if (!app.globalData.isAdmin) {
      wx.showToast({ title: '无权限访问', icon: 'error' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }
    this.loadAll()
  },

  onShow() {
    this.loadAll()
  },

  async loadAll() {
    await Promise.all([
      this.loadActivities(),
      this.loadAnnouncements(),
      this.loadMembers()
    ])
  },

  async loadActivities() {
    try {
      const res = await db.collection('activities')
        .orderBy('activityDate', 'desc')
        .limit(30)
        .get()

      const activities = res.data.map(act => {
        const registrations = act.registrations || []
        const confirmed = registrations.filter(r => r.status === 'confirmed')
        const actDate = act.activityDate instanceof Date ? act.activityDate : new Date(act.activityDate)
        const now = new Date()
        
        let statusText, statusClass
        if (act.status === 'cancelled') { statusText = '已取消'; statusClass = 'tag-red' }
        else if (act.status === 'finished' || actDate < now) { statusText = '已结束'; statusClass = 'tag-gray' }
        else { statusText = '报名中'; statusClass = 'tag-green' }

        const m = actDate.getMonth() + 1
        const d = actDate.getDate()

        return {
          ...act,
          confirmedCount: confirmed.length,
          displayDate: `${m}月${d}日`,
          statusText,
          statusClass
        }
      })

      this.setData({ activities })
    } catch (e) { console.error(e) }
  },

  async loadAnnouncements() {
    try {
      const res = await db.collection('announcements')
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get()
      this.setData({ announcements: res.data })
    } catch (e) { console.error(e) }
  },

  async loadMembers() {
    try {
      const res = await db.collection('users')
        .orderBy('updatedAt', 'desc')
        .limit(50)
        .get()
      // base64 直接用，不走云存储权限
      const members = res.data.map(user => ({
        ...user,
        displayAvatar: app.getDisplayAvatar(user) || app.globalData.defaultAvatar
      }))
      this.setData({ members })
    } catch (e) { console.error(e) }
  },

  createActivity() {
    wx.navigateTo({ url: '/pages/activity/create' })
  },

  editActivity(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/activity/create?id=${id}` })
  },

  viewActivity(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/activity/detail?id=${id}` })
  },

  createAnnouncement() {
    this.setData({ showAnnouncementModal: true, newAnnouncement: '' })
  },

  onAnnouncementInput(e) {
    this.setData({ newAnnouncement: e.detail.value })
  },

  closeAnnouncementModal() {
    this.setData({ showAnnouncementModal: false })
  },

  async submitAnnouncement() {
    const { newAnnouncement } = this.data
    if (!newAnnouncement.trim()) {
      wx.showToast({ title: '请输入公告内容', icon: 'none' })
      return
    }
    wx.showLoading({ title: '发布中...' })
    try {
      await db.collection('announcements').add({
        data: {
          content: newAnnouncement.trim(),
          active: true,
          createdAt: db.serverDate(),
          createdBy: app.globalData.openid || wx.getStorageSync('openid')
        }
      })
      wx.hideLoading()
      wx.showToast({ title: '公告发布成功', icon: 'success' })
      this.setData({ showAnnouncementModal: false })
      this.loadAnnouncements()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '发布失败', icon: 'error' })
    }
  },

  async toggleAnnouncement(e) {
    const { id, active } = e.currentTarget.dataset
    await db.collection('announcements').doc(id).update({
      data: { active: !active }
    })
    this.loadAnnouncements()
  },

  deleteAnnouncement(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除公告',
      content: '确定删除这条公告？',
      confirmColor: '#e74c3c',
      success: async (res) => {
        if (res.confirm) {
          await db.collection('announcements').doc(id).remove()
          this.loadAnnouncements()
        }
      }
    })
  },

  manageMembers() {
    // 滚动到球员列表
    wx.pageScrollTo({ selector: '.member-item', duration: 300 })
  },

  exportData() {
    wx.showToast({ title: '数据导出功能开发中', icon: 'none' })
  },

  stopPropagation() {}
})
