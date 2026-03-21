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
      matchType: '友谊赛',
      customMatchType: false,
      customMatchTypeText: '',
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
    // 预设赛制类型
    presetMatchTypes: ['友谊赛', '11人制', '9人制', '8人制', '7人制', '5人制'],
    // 当前活动的自定义赛制类型（每个活动独立）
    customMatchTypes: [],
    // 是否显示自定义输入框
    showCustomInput: false,
    // 正在编辑的自定义类型索引
    editingCustomIndex: -1,
    fieldTypes: [
      { value: '人工草', label: '⬜ 人工草' },
      { value: '天然草', label: '🌿 天然草' },
      { value: '硬地', label: '🏢 硬地' },
      { value: '沙滩', label: '🏖 沙滩' }
    ],
    // 截止时间预设选项
    deadlineOptions: [
      { value: '1day', label: '报名前1天', hours: 24 },
      { value: '6hours', label: '报名前6小时', hours: 6 },
      { value: '1hour', label: '报名前1小时', hours: 1 },
      { value: '30min', label: '报名前0.5小时', hours: 0.5 },
      { value: 'none', label: '不限制', hours: 0 }
    ],
    selectedDeadline: '1day'
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



  // 保存自定义赛制类型（仅更新当前页面状态）
  saveCustomMatchTypes(types) {
    this.setData({ customMatchTypes: types })
  },

  // 选择截止时间
  selectDeadline(e) {
    const value = e.currentTarget.dataset.value
    this.setData({ selectedDeadline: value })
    this.calculateDeadline(value)
  },

  // 计算截止时间
  calculateDeadline(optionValue) {
    const option = this.data.deadlineOptions.find(item => item.value === optionValue)
    if (!option || option.value === 'none') {
      this.setData({ 
        'form.deadline': null,
        'form.deadlineDisplay': '不限制'
      })
      return
    }

    const { form } = this.data
    if (!form.date || !form.startTime) {
      this.setData({ 
        'form.deadline': null,
        'form.deadlineDisplay': option.label
      })
      return
    }

    // 根据活动时间计算截止时间
    const activityTime = new Date(`${form.date} ${form.startTime}`)
    const deadline = new Date(activityTime.getTime() - option.hours * 60 * 60 * 1000)
    
    const month = deadline.getMonth() + 1
    const date = deadline.getDate()
    const hours = deadline.getHours().toString().padStart(2, '0')
    const minutes = deadline.getMinutes().toString().padStart(2, '0')

    this.setData({
      'form.deadline': deadline,
      'form.deadlineDisplay': `${month}月${date}日 ${hours}:${minutes}`
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

      // 加载该活动的自定义赛制类型
      const activityCustomTypes = act.customMatchTypes || []
      
      // 判断当前赛制类型是否是自定义的
      const presetTypes = ['友谊赛', '11人制', '9人制', '8人制', '7人制', '5人制']
      const isCustomMatchType = act.matchType && !presetTypes.includes(act.matchType)

      // 处理截止时间显示
      let deadlineDisplay = ''
      let selectedDeadline = '1day'
      if (act.deadline) {
        const deadline = act.deadline instanceof Date ? act.deadline : new Date(act.deadline)
        const activityTime = actDateStr
        const diffHours = (activityTime - deadline) / (1000 * 60 * 60)
        
        // 根据时间差匹配预设选项
        if (diffHours >= 23 && diffHours <= 25) selectedDeadline = '1day'
        else if (diffHours >= 5.5 && diffHours <= 6.5) selectedDeadline = '6hours'
        else if (diffHours >= 0.8 && diffHours <= 1.2) selectedDeadline = '1hour'
        else if (diffHours >= 0.4 && diffHours <= 0.6) selectedDeadline = '30min'
        else selectedDeadline = 'none'
        
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

      this.setData({ form, selectedDeadline, customMatchTypes: activityCustomTypes })
    } catch (e) {
      console.error('加载活动失败', e)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ [`form.${key}`]: e.detail.value })
  },

  onDateChange(e) { 
    this.setData({ 'form.date': e.detail.value })
    // 重新计算截止时间
    setTimeout(() => this.calculateDeadline(this.data.selectedDeadline), 0)
  },
  onStartTimeChange(e) { 
    this.setData({ 'form.startTime': e.detail.value })
    // 重新计算截止时间
    setTimeout(() => this.calculateDeadline(this.data.selectedDeadline), 0)
  },
  onEndTimeChange(e) { this.setData({ 'form.endTime': e.detail.value }) },
  onAllowPendingChange(e) { this.setData({ 'form.allowPending': e.detail.value }) },

  // 赛制类型选择
  selectMatchType(e) {
    const value = e.currentTarget.dataset.value
    this.setData({
      'form.matchType': value,
      showCustomInput: false,
      editingCustomIndex: -1
    })
  },

  // 显示添加自定义赛制输入框
  showAddCustomMatchType() {
    this.setData({
      showCustomInput: true,
      'form.customMatchTypeText': '',
      editingCustomIndex: -1
    })
  },

  // 编辑自定义赛制
  editCustomMatchType(e) {
    const index = e.currentTarget.dataset.index
    const value = this.data.customMatchTypes[index]
    this.setData({
      showCustomInput: true,
      'form.customMatchTypeText': value,
      editingCustomIndex: index
    })
  },

  // 保存自定义赛制
  saveCustomMatchType() {
    const text = this.data.form.customMatchTypeText.trim()
    if (!text) {
      wx.showToast({ title: '请输入赛制名称', icon: 'none' })
      return
    }
    if (text.length > 10) {
      wx.showToast({ title: '赛制名称不能超过10个字', icon: 'none' })
      return
    }

    const { customMatchTypes, editingCustomIndex, presetMatchTypes } = this.data
    
    // 检查是否与预设重复
    if (presetMatchTypes.includes(text)) {
      wx.showToast({ title: '该赛制已存在', icon: 'none' })
      return
    }

    let newTypes = [...customMatchTypes]
    
    if (editingCustomIndex >= 0) {
      // 编辑模式
      newTypes[editingCustomIndex] = text
    } else {
      // 新增模式
      // 检查是否已存在
      if (newTypes.includes(text)) {
        wx.showToast({ title: '该赛制已存在', icon: 'none' })
        return
      }
      newTypes.push(text)
    }

    this.saveCustomMatchTypes(newTypes)
    this.setData({
      'form.matchType': text,
      showCustomInput: false,
      'form.customMatchTypeText': '',
      editingCustomIndex: -1
    })
  },

  // 删除自定义赛制
  deleteCustomMatchType(e) {
    const index = e.currentTarget.dataset.index
    const { customMatchTypes, form } = this.data
    const deletedType = customMatchTypes[index]
    
    wx.showModal({
      title: '确认删除',
      content: `删除后"${deletedType}"将不再显示，是否确认删除？`,
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          const newTypes = customMatchTypes.filter((_, i) => i !== index)
          this.saveCustomMatchTypes(newTypes)
          
          // 如果当前选中的是被删除的，切换到友谊赛
          if (form.matchType === deletedType) {
            this.setData({ 'form.matchType': '友谊赛' })
          }
        }
      }
    })
  },

  // 取消自定义输入
  cancelCustomInput() {
    this.setData({
      showCustomInput: false,
      'form.customMatchTypeText': '',
      editingCustomIndex: -1
    })
  },

  // 自定义赛制输入
  onCustomMatchTypeInput(e) {
    this.setData({ 'form.customMatchTypeText': e.detail.value })
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
    const { form, isEdit, activityId, customMatchTypes } = this.data

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
      updatedAt: db.serverDate(),
      // 保存该活动的自定义赛制类型
      customMatchTypes: customMatchTypes || []
    }

    try {
      if (isEdit) {
        await db.collection('activities').doc(activityId).update({ data })
        wx.hideLoading()
        wx.showToast({ title: '修改成功 ✅', icon: 'success' })
        // 跳转到活动详情页
        setTimeout(() => {
          wx.redirectTo({
            url: `/pages/activity/detail?id=${activityId}`
          })
        }, 1500)
      } else {
        data.registrations = []
        data.createdAt = db.serverDate()
        data.createdBy = app.globalData.openid || wx.getStorageSync('openid')

        const addRes = await db.collection('activities').add({ data })
        wx.hideLoading()
        wx.showToast({ title: '活动发布成功 🎉', icon: 'success' })
        // 跳转到活动详情页
        setTimeout(() => {
          wx.redirectTo({
            url: `/pages/activity/detail?id=${addRes._id}`
          })
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
            // 跳转到活动详情页查看取消后的状态
            setTimeout(() => {
              wx.redirectTo({
                url: `/pages/activity/detail?id=${activityId}`
              })
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
