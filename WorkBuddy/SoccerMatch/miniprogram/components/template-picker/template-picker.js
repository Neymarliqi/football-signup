// components/template-picker/template-picker.js
const app = getApp()

Component({
  properties: {
    // 当前选中的模板 id（用于高亮显示）
    selectedId: {
      type: String,
      value: ''
    }
  },

  data: {
    visible: false,
    templates: [],
    weekdays: ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  },

  lifetimes: {
    attached() {
      this._loadTemplates()
    }
  },

  methods: {
    // 加载模板列表
    _loadTemplates() {
      const templates = app.loadTemplates()
      // 格式化显示用字段
      const formatted = templates.map(t => ({
        ...t,
        weekdayLabel: this.data.weekdays[t.weekday] || '未知',
        timeLabel: t.startTime + (t.endTime ? '-' + t.endTime : ''),
        teamLabel: t.teamName || '个人活动'
      }))
      this.setData({ templates: formatted })
    },

    // 打开弹窗
    open() {
      this._loadTemplates() // 每次打开刷新列表
      this.setData({ visible: true })
    },

    // 关闭弹窗
    close() {
      this.setData({ visible: false })
    },

    // 阻止冒泡
    stopBubble() {
      return
    },

    // 选择模板
    onSelect(e) {
      const tpl = e.currentTarget.dataset.tpl
      this.triggerEvent('select', { template: tpl })
      this.close()
    },

    // 删除模板
    onDelete(e) {
      const tpl = e.currentTarget.dataset.tpl
      wx.showModal({
        title: '删除模板',
        content: `确定删除「${tpl.name}」吗？`,
        confirmText: '删除',
        confirmColor: '#e74c3c',
        success: res => {
          if (res.confirm) {
            app.deleteTemplate(tpl.id)
            this._loadTemplates()
            // 如果删除的是当前选中项，通知父组件
            if (tpl.id === this.data.selectedId) {
              this.triggerEvent('deselect')
            }
          }
        }
      })
    }
  }
})
