// pages/activity/create.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    isEdit: false,
    activityId: '',
    form: {
      title: '',
      description: '',
      matchType: '11人制',
      date: '',
      startTime: '',
      endTime: '',
      locationName: '',
      location: '',
      latitude: 0,
      longitude: 0,
      fieldType: '天然草',
      maxPlayers: 16,
      fee: 0,
      deadline: '',
      allowPending: true,
      notice: '',
      status: 'open'
    },
    matchTypes: [
      { value: '11人制', label: '11人制' },
      { value: '7人制', label: '7人制' },
      { value: '5人制', label: '5人制' },
      { value: '3人制', label: '3人制' },
      { value: '友谊赛', label: '友谊赛' }
    ],
    fieldTypes: [
      { value: '天然草', label: '🌿 天然草' },
      { value: '人工草', label: '⬜ 人工草' },
      { value: '硬地', label: '🏢 硬地' },
      { value: '沙滩', label: '🏖 沙滩' }
    ]
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ isEdit: true, activityId: options.id })
      this.loadActivity(options.id)
    } else {
      // 默认日期设为明天
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const defaultDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`
      this.setData({ 'form.date': defaultDate, 'form.startTime': '19:00', 'form.endTime': '21:00' })
    }

    wx.setNavigationBarTitle({ title: options.id ? '编辑活动' : '发布活动' })
  },

  async loadActivity(id) {
    const res = await db.collection('activities').doc(id).get()
    const act = res.data
    const actDate = act.activityDate instanceof Date ? act.activityDate : new Date(act.activityDate)
    const form = {
      title: act.title,
      description: act.description || '',
      matchType: act.matchType,
      date: `${actDate.getFullYear()}-${String(actDate.getMonth()+1).padStart(2,'0')}-${String(actDate.getDate()).padStart(2,'0')}`,
      startTime: act.startTime || '',
      endTime: act.endTime || '',
      locationName: act.locationName || '',
      location: act.location || '',
      latitude: act.latitude || 0,
      longitude: act.longitude || 0,
      fieldType: act.fieldType || '天然草',
      maxPlayers: act.maxPlayers,
      fee: act.fee || 0,
      deadline: act.deadline || '',
      allowPending: act.allowPending !== false,
      notice: act.notice || '',
      status: act.status || 'open'
    }
    this.setData({ form })
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ [`form.${key}`]: e.detail.value })
  },

  onDateChange(e) { this.setData({ 'form.date': e.detail.value }) },
  onStartTimeChange(e) { this.setData({ 'form.startTime': e.detail.value }) },
  onEndTimeChange(e) { this.setData({ 'form.endTime': e.detail.value }) },
  onDeadlineChange(e) { this.setData({ 'form.deadline': e.detail.value }) },
  onAllowPendingChange(e) { this.setData({ 'form.allowPending': e.detail.value }) },

  selectMatchType(e) { this.setData({ 'form.matchType': e.currentTarget.dataset.value }) },
  selectFieldType(e) { this.setData({ 'form.fieldType': e.currentTarget.dataset.value }) },

  increaseMax() {
    const max = Math.min(this.data.form.maxPlayers + 1, 30)
    this.setData({ 'form.maxPlayers': max })
  },
  decreaseMax() {
    const max = Math.max(this.data.form.maxPlayers - 1, 2)
    this.setData({ 'form.maxPlayers': max })
  },
  increaseFee() {
    const fee = this.data.form.fee + 5
    this.setData({ 'form.fee': fee })
  },
  decreaseFee() {
    const fee = Math.max(this.data.form.fee - 5, 0)
    this.setData({ 'form.fee': fee })
  },

  // 选择地点
  pickLocation() {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          'form.locationName': res.name || this.data.form.locationName,
          'form.location': res.address,
          'form.latitude': res.latitude,
          'form.longitude': res.longitude
        })
      },
      fail: () => {}
    })
  },

  // 校验表单
  validate() {
    const { form } = this.data
    if (!form.title.trim()) { wx.showToast({ title: '请填写活动标题', icon: 'none' }); return false }
    if (!form.date) { wx.showToast({ title: '请选择踢球日期', icon: 'none' }); return false }
    if (!form.startTime) { wx.showToast({ title: '请选择开始时间', icon: 'none' }); return false }
    if (!form.locationName.trim()) { wx.showToast({ title: '请填写场地名称', icon: 'none' }); return false }
    if (!form.location.trim()) { wx.showToast({ title: '请填写详细地址', icon: 'none' }); return false }
    return true
  },

  async submit() {
    if (!this.validate()) return

    wx.showLoading({ title: '发布中...' })
    const { form, isEdit, activityId } = this.data

    // 构建活动时间
    const timeStr = form.endTime ? `${form.startTime} - ${form.endTime}` : form.startTime
    const activityDate = new Date(`${form.date} ${form.startTime}`)

    const data = {
      title: form.title.trim(),
      description: form.description.trim(),
      matchType: form.matchType,
      activityDate,
      time: timeStr,
      startTime: form.startTime,
      endTime: form.endTime,
      locationName: form.locationName.trim(),
      location: form.location.trim(),
      latitude: form.latitude,
      longitude: form.longitude,
      fieldType: form.fieldType,
      maxPlayers: form.maxPlayers,
      fee: form.fee,
      deadline: form.deadline,
      allowPending: form.allowPending,
      notice: form.notice.trim(),
      status: 'open',
      updatedAt: db.serverDate()
    }

    try {
      if (isEdit) {
        await db.collection('activities').doc(activityId).update({ data })
        wx.hideLoading()
        wx.showToast({ title: '修改成功 ✅', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 1500)
      } else {
        data.registrations = []
        data.createdAt = db.serverDate()
        data.createdBy = app.globalData.openid || wx.getStorageSync('openid')

        await db.collection('activities').add({ data })
        wx.hideLoading()
        wx.showToast({ title: '活动发布成功 🎉', icon: 'success' })
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' })
        }, 1500)
      }
    } catch (e) {
      wx.hideLoading()
      console.error('发布失败', e)
      wx.showToast({ title: '操作失败，请重试', icon: 'error' })
    }
  },

  cancelActivity() {
    wx.showModal({
      title: '取消活动',
      content: '确定要取消本次活动吗？所有报名将清空。',
      confirmColor: '#e74c3c',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' })
          try {
            await db.collection('activities').doc(this.data.activityId).update({
              data: { status: 'cancelled', updatedAt: db.serverDate() }
            })
            wx.hideLoading()
            wx.showToast({ title: '活动已取消', icon: 'success' })
            setTimeout(() => {
              wx.switchTab({ url: '/pages/index/index' })
            }, 1500)
          } catch (e) {
            wx.hideLoading()
            wx.showToast({ title: '操作失败', icon: 'error' })
          }
        }
      }
    })
  }
})
