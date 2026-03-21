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
      matchType: '',
      customMatchType: false,
      date: '',
      startTime: '',
      endTime: '',
      locationName: '',
      location: '',
      latitude: 0,
      longitude: 0,
      fieldType: '人工草',
      maxPlayers: 16,
      fee: 0,
      deadline: '',
      deadlineDisplay: '',
      allowPending: true,
      notice: '',
      status: 'open'
    },
    matchTypes: [
      { value: '11人制', label: '11人制' },
      { value: '9人制', label: '9人制' },
      { value: '8人制', label: '8人制' },
      { value: '7人制', label: '7人制' },
      { value: '5人制', label: '5人制' },
      { value: '友谊赛', label: '友谊赛' }
    ],
    fieldTypes: [
      { value: '人工草', label: '⬜ 人工草' },
      { value: '天然草', label: '🌿 天然草' },
      { value: '硬地', label: '🏢 硬地' },
      { value: '沙滩', label: '🏖 沙滩' }
    ],
    // 截止时间选择器数据
    deadlineRange: [],
    deadlineIndex: [0, 0, 0, 0]
  },

  onLoad(options) {
    // 初始化截止时间选择器
    this.initDeadlinePicker()

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

  // 初始化截止时间选择器
  initDeadlinePicker() {
    const now = new Date()
    const days = []
    const hours = []
    const minutes = []

    // 生成未来7天的日期选项
    for (let i = 0; i < 7; i++) {
      const d = new Date(now)
      d.setDate(d.getDate() + i)
      const month = d.getMonth() + 1
      const date = d.getDate()
      const weekdays = ['日', '一', '二', '三', '四', '五', '六']
      const week = weekdays[d.getDay()]
      days.push(`${month}月${date}日(周${week})`)
    }

    // 生成小时选项 (0-23)
    for (let i = 0; i < 24; i++) {
      hours.push(`${i.toString().padStart(2, '0')}时`)
    }

    // 生成分钟选项 (00, 15, 30, 45)
    const minuteOpts = ['00分', '15分', '30分', '45分']

    this.setData({
      deadlineRange: [days, hours, minuteOpts],
      deadlineIndex: [0, now.getHours(), Math.floor(now.getMinutes() / 15)]
    })
  },

  async loadActivity(id) {
    try {
      const res = await db.collection('activities').doc(id).get()
      const act = res.data
      
      // 权限检查：只有创建者可编辑
      const openid = app.globalData.openid || wx.getStorageSync('openid')
      if (act.createdBy !== openid && !app.globalData.isAdmin) {
        wx.showToast({ title: '无权编辑此活动', icon: 'error' })
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }
      
      // 状态检查：只有open状态可编辑
      const now = new Date()
      const actDate = act.activityDate instanceof Date ? act.activityDate : new Date(act.activityDate)
      if (act.status !== 'open' && actDate < now) {
        wx.showToast({ title: '活动已结束或取消，无法编辑', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }
      
      const actDateStr = act.activityDate instanceof Date ? act.activityDate : new Date(act.activityDate)

      // 判断是否是预设的赛制类型
      const presetTypes = ['11人制', '7人制', '5人制', '3人制', '友谊赛']
      const isCustomMatchType = act.matchType && !presetTypes.includes(act.matchType)

      // 处理截止时间显示
      let deadlineDisplay = ''
      let deadlineIndex = [0, 0, 0]
      if (act.deadline) {
        const deadline = act.deadline instanceof Date ? act.deadline : new Date(act.deadline)
        const now = new Date()
        const diffDays = Math.floor((deadline - now) / (1000 * 60 * 60 * 24))
        if (diffDays >= 0 && diffDays < 7) {
          deadlineIndex = [diffDays, deadline.getHours(), Math.floor(deadline.getMinutes() / 15)]
        }
        const month = deadline.getMonth() + 1
        const date = deadline.getDate()
        const hours = deadline.getHours().toString().padStart(2, '0')
        const minutes = deadline.getMinutes().toString().padStart(2, '0')
        deadlineDisplay = `${month}月${date}日 ${hours}:${minutes}`
      }

      const form = {
        title: act.title || '',
        description: act.description || '',
        matchType: act.matchType || '',
        customMatchType: isCustomMatchType,
        date: `${actDateStr.getFullYear()}-${String(actDateStr.getMonth() + 1).padStart(2, '0')}-${String(actDateStr.getDate()).padStart(2, '0')}`,
        startTime: act.time ? act.time.split(' - ')[0] : '',
        endTime: act.time && act.time.includes(' - ') ? act.time.split(' - ')[1] : '',
        locationName: act.locationName || '',
        location: act.location || '',
        latitude: act.latitude || 0,
        longitude: act.longitude || 0,
        fieldType: act.fieldType || '人工草',
        maxPlayers: act.maxPlayers || 16,
        fee: act.fee || 0,
        deadline: act.deadline || '',
        deadlineDisplay: deadlineDisplay,
        allowPending: act.allowPending !== false,
        notice: act.notice || '',
        status: act.status || 'open'
      }

      this.setData({ form, deadlineIndex: deadlineIndex.length === 3 ? deadlineIndex : this.data.deadlineIndex })
    } catch (e) {
      console.error('加载活动失败', e)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ [`form.${key}`]: e.detail.value })
  },

  onDateChange(e) { this.setData({ 'form.date': e.detail.value }) },
  onStartTimeChange(e) { this.setData({ 'form.startTime': e.detail.value }) },
  onEndTimeChange(e) { this.setData({ 'form.endTime': e.detail.value }) },
  onAllowPendingChange(e) { this.setData({ 'form.allowPending': e.detail.value }) },

  // 赛制类型选择
  selectMatchType(e) {
    this.setData({
      'form.matchType': e.currentTarget.dataset.value,
      'form.customMatchType': false
    })
  },

  // 启用自定义赛制
  enableCustomMatchType() {
    this.setData({
      'form.customMatchType': true,
      'form.matchType': ''
    })
  },

  // 自定义赛制输入
  onCustomMatchTypeInput(e) {
    this.setData({ 'form.matchType': e.detail.value })
  },

  selectFieldType(e) { this.setData({ 'form.fieldType': e.currentTarget.dataset.value }) },

  // 截止时间选择
  onDeadlineChange(e) {
    const [dayIndex, hourIndex, minuteIndex] = e.detail.value
    const now = new Date()
    const selectedDate = new Date(now)
    selectedDate.setDate(selectedDate.getDate() + dayIndex)
    selectedDate.setHours(hourIndex)
    selectedDate.setMinutes(minuteIndex * 15)
    selectedDate.setSeconds(0)

    const month = selectedDate.getMonth() + 1
    const date = selectedDate.getDate()
    const hours = selectedDate.getHours().toString().padStart(2, '0')
    const minutes = selectedDate.getMinutes().toString().padStart(2, '0')

    this.setData({
      'form.deadline': selectedDate,
      'form.deadlineDisplay': `${month}月${date}日 ${hours}:${minutes}`,
      deadlineIndex: [dayIndex, hourIndex, minuteIndex]
    })
  },

  // 清除截止时间
  clearDeadline() {
    this.setData({
      'form.deadline': '',
      'form.deadlineDisplay': ''
    })
  },

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
          'form.locationName': res.name || '未命名场地',
          'form.location': res.address,
          'form.latitude': res.latitude,
          'form.longitude': res.longitude
        })
      },
      fail: (err) => {
        console.log('选择地点失败', err)
        // 用户取消不提示错误
        if (err.errMsg && err.errMsg.includes('cancel')) return
        wx.showToast({ title: '选择地点失败', icon: 'none' })
      }
    })
  },

  // 清除导航地址
  clearLocation() {
    this.setData({
      'form.locationName': '',
      'form.location': '',
      'form.latitude': 0,
      'form.longitude': 0
    })
  },

  // 设置不限人数
  setUnlimitedPlayers() {
    this.setData({ 'form.maxPlayers': 999 })
  },

  // 设置限制人数
  setLimitedPlayers() {
    this.setData({ 'form.maxPlayers': 16 })
  },

  // 校验表单
  validate() {
    const { form } = this.data
    if (!form.title.trim()) { wx.showToast({ title: '请填写活动标题', icon: 'none' }); return false }
    if (!form.date) { wx.showToast({ title: '请选择踢球日期', icon: 'none' }); return false }
    if (!form.startTime) { wx.showToast({ title: '请选择开始时间', icon: 'none' }); return false }
    if (!form.locationName.trim()) { wx.showToast({ title: '请填写场地名称', icon: 'none' }); return false }

    // 赛制类型改为非必填，如果有值则校验
    if (form.matchType && form.matchType.trim().length > 10) {
      wx.showToast({ title: '赛制类型不能超过10个字', icon: 'none' })
      return false
    }
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

  // 在编辑页面取消活动
  cancelActivityInEdit() {
    const { isEdit, activityId } = this.data
    if (!isEdit || !activityId) return
    
    wx.showModal({
      title: '取消活动',
      content: '确定要取消本次活动吗？取消后成员将无法报名。',
      confirmColor: '#e74c3c',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' })
          try {
            await db.collection('activities').doc(activityId).update({
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
