// components/date-picker/date-picker.js
Component({
  properties: {
    // 当前值，格式 "YYYY-MM-DD"
    value: {
      type: String,
      value: '',
      observer: function(newVal) {
        // 父组件更新 value 时，同步重新计算周几
        if (newVal && this._inited) {
          this._initData(newVal)
        }
      }
    },
    // placeholder
    placeholder: {
      type: String,
      value: '选择日期'
    },
    // 最小年份（默认今年-1）
    minYear: {
      type: Number,
      value: new Date().getFullYear() - 1
    },
    // 最大年份（默认今年+2）
    maxYear: {
      type: Number,
      value: new Date().getFullYear() + 2
    }
  },

  data: {
    showPopup: false,
    years: [],        // ["2025", "2026", ...]
    months: [],       // ["01","02",...]
    days: [],         // ["01","02",...]
    yearIndex: 0,
    monthIndex: 0,
    dayIndex: 0,
    weekdayText: '',  // "周六"
    weekdayClass: '' // "weekday-weekend"
  },

  lifetimes: {
    attached() {
      this._inited = false
      // attached 时 properties.value 可能还没从父组件传入，先用空值初始化
      // 后续 value 的 observer 会用正确值重新计算
      this._initData(this.properties.value || '')
      this._inited = true
    }
  },

  methods: {
    // 阻止冒泡（点弹窗内容时不关闭遮罩）
    stopBubble() {
      return
    },

    // ========== 初始化数据 ==========
    _initData(value) {
      const now = new Date()
      let year, month, day

      if (value) {
        const parts = value.split('-')
        year = parseInt(parts[0])
        month = parseInt(parts[1])
        day = parseInt(parts[2])
      } else {
        year = now.getFullYear()
        month = now.getMonth() + 1
        day = now.getDate()
      }

      // 生成年份数组
      const years = []
      for (let y = this.properties.minYear; y <= this.properties.maxYear; y++) {
        years.push(String(y))
      }

      // 生成月份数组（固定1-12）
      const months = []
      for (let m = 1; m <= 12; m++) {
        months.push(String(m).padStart(2, '0'))
      }

      // 找到当前选中索引
      const yearIndex = years.indexOf(String(year))
      const monthIndex = months.indexOf(String(month).padStart(2, '0'))

      // 生成日期数组（根据年月）
      const days = this._generateDays(year, month)
      let dayIndex = days.indexOf(String(day).padStart(2, '0'))
      if (dayIndex < 0) dayIndex = days.length - 1

      // 计算周几
      const { text, cls } = this._calcWeekday(year, month, parseInt(days[dayIndex] || day))

      this.setData({
        years,
        months,
        days,
        yearIndex: yearIndex >= 0 ? yearIndex : 0,
        monthIndex,
        dayIndex,
        weekdayText: text,
        weekdayClass: cls
      })
    },

    // 生成某年某月的日期数组
    _generateDays(year, month) {
      const daysInMonth = new Date(year, month, 0).getDate()
      const days = []
      for (let d = 1; d <= daysInMonth; d++) {
        days.push(String(d).padStart(2, '0'))
      }
      return days
    },

  // 计算周几（纯数学 Sakamoto 算法，无 timezone 问题）
  _calcWeekday(year, month, day) {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    // Sakamoto 纯数学算法
    const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]
    let y = year
    if (month < 3) y--
    const dow = (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[month - 1] + day) % 7
    const w = dow
    const text = weekdays[w]
    const cls = w === 0 || w === 6 ? 'weekday-weekend' : (w === 5 ? 'weekday-friday' : 'weekday-normal')
    return { text, cls }
  },

    // ========== 打开弹窗 ==========
    open() {
      this._initData(this.properties.value)
      this.setData({ showPopup: true })
    },

    // 点击遮罩关闭
    onMaskTap() {
      this.setData({ showPopup: false })
    },

    // 取消
    onCancel() {
      this.setData({ showPopup: false })
    },

    // picker 滚动时更新日/月/日
    onChange(e) {
      const { value } = e.detail
      const yearIndex = +value[0]
      const monthIndex = +value[1]
      const dayIndex = +value[2]

      const year = +this.data.years[yearIndex]
      const month = +this.data.months[monthIndex]

      // 如果月份或年份变了，重新生成日期数组
      const prevYear = +this.data.years[this.data.yearIndex]
      const prevMonth = +this.data.months[this.data.monthIndex]
      let days = this.data.days
      let newDayIndex = dayIndex

      if (year !== prevYear || month !== prevMonth) {
        days = this._generateDays(year, month)
        // 新的日期数组可能更短，超界了则截断
        if (newDayIndex >= days.length) {
          newDayIndex = days.length - 1
        }
      }

      const { text, cls } = this._calcWeekday(year, month, parseInt(days[newDayIndex]))

      this.setData({
        yearIndex,
        monthIndex,
        dayIndex: newDayIndex,
        days,
        weekdayText: text,
        weekdayClass: cls
      })
    },

    // 确认选择
    onConfirm() {
      const year = this.data.years[this.data.yearIndex]
      const month = this.data.months[this.data.monthIndex]
      const day = this.data.days[this.data.dayIndex]
      const dateStr = `${year}-${month}-${day}`
      const weekdayText = this.data.weekdayText

      this.setData({ showPopup: false })

      // 向外触发事件
      this.triggerEvent('change', { value: dateStr, weekday: weekdayText })
    },

    // 外部设值（由父组件调用，用于初始回显）
    setValue(value) {
      this._initData(value)
    }
  }
})
