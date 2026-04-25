// pages/profile/templates/templates.js
const app = getApp()

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const DEADLINE_LABELS = { '1day': '1天前', '6hours': '6小时前', '1hour': '1小时前', '30min': '30分钟前', 'none': '不限制' }
const VISIBILITY_LABELS = { 'open': '允许非成员参加（默认）', 'memberOnly': '仅球队成员' }

Page({
  data: {
    templates: [],
    // 编辑弹窗
    editVisible: false,
    editId: '',
    editName: '',
    editNameLen: 0
  },

  onShow() {
    this._loadTemplates()
  },

  _loadTemplates() {
    const raw = app.loadTemplates()
    const list = raw.map(t => ({
      ...t,
      weekdayLabel: WEEKDAYS[t.weekday] || '-',
      timeLabel: t.startTime ? (t.startTime + (t.endTime ? '-' + t.endTime : '')) : '-',
      deadlineLabel: DEADLINE_LABELS[t.selectedDeadline] || '不限制',
      visibilityLabel: VISIBILITY_LABELS[t.visibility] || '允许非成员参加（默认）',
      teamLabel: t.teamName || '',
      createdAtLabel: t.createdAt ? _formatDate(t.createdAt) : ''
    }))
    this.setData({ templates: list })
  },

  // 点击编辑（修改名称）
  onEdit(e) {
    const tpl = e.currentTarget.dataset.tpl
    this.setData({
      editVisible: true,
      editId: tpl.id,
      editName: tpl.name,
      editNameLen: (tpl.name || '').length
    })
  },

  onEditNameInput(e) {
    const val = e.detail.value
    this.setData({ editName: val, editNameLen: val.length })
  },

  onEditCancel() {
    this.setData({ editVisible: false, editId: '', editName: '' })
  },

  onEditConfirm() {
    const { editId, editName } = this.data
    const name = (editName || '').trim()
    if (!name) {
      wx.showToast({ title: '名称不能为空', icon: 'none' })
      return
    }
    app.updateTemplate(editId, { name })
    this.setData({ editVisible: false, editId: '', editName: '' })
    this._loadTemplates()
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  // 阻止蒙层穿透
  stopBubble() {},

  // 点击删除
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
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  // 返回
  onBack() {
    wx.navigateBack()
  }
})

function _formatDate(ts) {
  const d = new Date(ts)
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${m}月${day}日`
}
