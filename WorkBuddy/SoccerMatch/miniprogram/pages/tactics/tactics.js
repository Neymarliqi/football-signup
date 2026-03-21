// pages/tactics/tactics.js
const app = getApp()
const db = wx.cloud.database()

// 预设阵型位置（百分比坐标）
const FORMATIONS = {
  '4-3-3': [
    { posLabel: 'GK', x: 50, y: 90 },
    { posLabel: 'LB', x: 15, y: 72 }, { posLabel: 'CB', x: 35, y: 72 },
    { posLabel: 'CB', x: 65, y: 72 }, { posLabel: 'RB', x: 85, y: 72 },
    { posLabel: 'LM', x: 20, y: 54 }, { posLabel: 'CM', x: 50, y: 54 }, { posLabel: 'RM', x: 80, y: 54 },
    { posLabel: 'LW', x: 20, y: 32 }, { posLabel: 'ST', x: 50, y: 28 }, { posLabel: 'RW', x: 80, y: 32 }
  ],
  '4-4-2': [
    { posLabel: 'GK', x: 50, y: 90 },
    { posLabel: 'LB', x: 15, y: 72 }, { posLabel: 'CB', x: 35, y: 72 },
    { posLabel: 'CB', x: 65, y: 72 }, { posLabel: 'RB', x: 85, y: 72 },
    { posLabel: 'LM', x: 15, y: 52 }, { posLabel: 'CM', x: 38, y: 52 },
    { posLabel: 'CM', x: 62, y: 52 }, { posLabel: 'RM', x: 85, y: 52 },
    { posLabel: 'ST', x: 35, y: 28 }, { posLabel: 'ST', x: 65, y: 28 }
  ],
  '3-5-2': [
    { posLabel: 'GK', x: 50, y: 90 },
    { posLabel: 'CB', x: 25, y: 74 }, { posLabel: 'CB', x: 50, y: 74 }, { posLabel: 'CB', x: 75, y: 74 },
    { posLabel: 'LWB', x: 12, y: 56 }, { posLabel: 'CM', x: 30, y: 54 }, { posLabel: 'CM', x: 50, y: 54 },
    { posLabel: 'CM', x: 70, y: 54 }, { posLabel: 'RWB', x: 88, y: 56 },
    { posLabel: 'ST', x: 35, y: 28 }, { posLabel: 'ST', x: 65, y: 28 }
  ],
  '4-2-3-1': [
    { posLabel: 'GK', x: 50, y: 90 },
    { posLabel: 'LB', x: 15, y: 73 }, { posLabel: 'CB', x: 37, y: 73 },
    { posLabel: 'CB', x: 63, y: 73 }, { posLabel: 'RB', x: 85, y: 73 },
    { posLabel: 'CDM', x: 37, y: 60 }, { posLabel: 'CDM', x: 63, y: 60 },
    { posLabel: 'LW', x: 18, y: 42 }, { posLabel: 'CAM', x: 50, y: 42 }, { posLabel: 'RW', x: 82, y: 42 },
    { posLabel: 'ST', x: 50, y: 26 }
  ],
  '5-5': [
    { posLabel: 'GK', x: 50, y: 90 },
    { posLabel: 'LB', x: 18, y: 72 }, { posLabel: 'CB', x: 38, y: 72 },
    { posLabel: 'CB', x: 62, y: 72 }, { posLabel: 'RB', x: 82, y: 72 },
    { posLabel: 'LW', x: 18, y: 40 }, { posLabel: 'CM', x: 35, y: 44 },
    { posLabel: 'CM', x: 65, y: 44 }, { posLabel: 'RW', x: 82, y: 40 },
    { posLabel: 'ST', x: 50, y: 26 }
  ]
}

Page({
  data: {
    activityId: '',
    playerTokens: [],
    selectedPlayer: null,
    selectedPlayerInfo: null,
    editMode: false,
    isAdmin: false,
    fieldHeight: 500,
    placeholderAvatar: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0',
    formations: [
      { label: '4-3-3', value: '4-3-3' },
      { label: '4-4-2', value: '4-4-2' },
      { label: '3-5-2', value: '3-5-2' },
      { label: '4-2-3-1', value: '4-2-3-1' },
      { label: '5-5（小场）', value: '5-5' }
    ],
    selectedFormation: '4-3-3',
    positionOptions: [
      { value: 'GK', label: '守门员' }, { value: 'LB', label: '左后卫' },
      { value: 'CB', label: '中后卫' }, { value: 'RB', label: '右后卫' },
      { value: 'LWB', label: '左翼卫' }, { value: 'RWB', label: '右翼卫' },
      { value: 'CDM', label: '后腰' }, { value: 'CM', label: '中场' },
      { value: 'LM', label: '左中场' }, { value: 'RM', label: '右中场' },
      { value: 'CAM', label: '前腰' }, { value: 'LW', label: '左边锋' },
      { value: 'RW', label: '右边锋' }, { value: 'ST', label: '中锋' },
      { value: 'CF', label: '前锋' }
    ],
    unassignedCount: 0,
    // 拖拽相关
    draggingIndex: -1,
    fieldRect: null
  },

  onLoad(options) {
    this.setData({
      activityId: options.activityId,
      isAdmin: app.globalData.isAdmin
    })
    this.calcFieldHeight()
    this.loadTactics()
  },

  calcFieldHeight() {
    // 按屏幕宽度计算场地高度（保持足球场比例约1:1.5）
    const { windowWidth } = wx.getSystemInfoSync()
    const fieldWidth = windowWidth - 40 // padding 20*2
    const fieldHeight = Math.round(fieldWidth * 1.45)
    this.setData({ fieldHeight })
  },

  async loadTactics() {
    const { activityId } = this.data
    try {
      // 获取活动数据
      const res = await db.collection('activities').doc(activityId).get()
      const act = res.data
      const registrations = (act.registrations || []).filter(r => r.status === 'confirmed')

      // 获取战术数据
      let tacticPositions = {}
      try {
        const tacticRes = await db.collection('tactics').where({ activityId }).get()
        if (tacticRes.data.length > 0) {
          tacticPositions = tacticRes.data[0].positions || {}
          this.setData({ selectedFormation: tacticRes.data[0].formation || '4-3-3' })
        }
      } catch (e) {}

      // 合并球员和位置数据
      const playerTokens = registrations.map((r, index) => {
        const saved = tacticPositions[r.openid]
        // 默认位置：均匀分布在下半场
        const defaultX = ((index % 5) + 1) * (100 / 6)
        const defaultY = 70 + Math.floor(index / 5) * 15

        return {
          ...r,
          shortName: r.nickName ? r.nickName.slice(0, 3) : '队员',
          x: saved ? saved.x : defaultX,
          y: saved ? saved.y : defaultY,
          posLabel: saved ? saved.posLabel : ''
        }
      })

      const unassignedCount = playerTokens.filter(p => !p.posLabel).length
      this.setData({ playerTokens, unassignedCount })
    } catch (e) {
      console.error('加载战术失败', e)
    }
  },

  toggleEdit() {
    if (this.data.editMode) {
      // 保存
      this.saveTactics()
    }
    this.setData({ editMode: !this.data.editMode, selectedPlayer: null, selectedPlayerInfo: null })
  },

  async saveTactics() {
    if (!this.data.isAdmin) return
    const { activityId, playerTokens, selectedFormation } = this.data
    const positions = {}
    playerTokens.forEach(p => {
      positions[p.openid] = { x: p.x, y: p.y, posLabel: p.posLabel }
    })

    wx.showLoading({ title: '保存中...' })
    try {
      // 查询是否已有记录
      const existing = await db.collection('tactics').where({ activityId }).get()
      if (existing.data.length > 0) {
        await db.collection('tactics').doc(existing.data[0]._id).update({
          data: { positions, formation: selectedFormation, updatedAt: db.serverDate() }
        })
      } else {
        await db.collection('tactics').add({
          data: { activityId, positions, formation: selectedFormation, createdAt: db.serverDate() }
        })
      }
      wx.hideLoading()
      wx.showToast({ title: '布阵已保存 ✅', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'error' })
    }
  },

  // 选中球员token
  selectPlayerToken(e) {
    const openid = e.currentTarget.dataset.openid
    const { playerTokens, selectedPlayer } = this.data

    if (selectedPlayer === openid) {
      this.setData({ selectedPlayer: null, selectedPlayerInfo: null })
      return
    }

    const playerInfo = playerTokens.find(p => p.openid === openid)
    this.setData({
      selectedPlayer: openid,
      selectedPlayerInfo: playerInfo
    })
  },

  // 分配位置
  assignPosition(e) {
    const { pos, label } = e.currentTarget.dataset
    const { selectedPlayer, playerTokens } = this.data
    if (!selectedPlayer) return

    const updated = playerTokens.map(p => {
      if (p.openid === selectedPlayer) {
        return { ...p, posLabel: pos }
      }
      return p
    })

    const unassignedCount = updated.filter(p => !p.posLabel).length
    const selectedPlayerInfo = updated.find(p => p.openid === selectedPlayer)
    this.setData({ playerTokens: updated, selectedPlayerInfo, unassignedCount })
  },

  closeAssignPanel() {
    this.setData({ selectedPlayer: null, selectedPlayerInfo: null })
  },

  // 应用阵型预设位置
  selectFormation(e) {
    const value = e.currentTarget.dataset.value
    const positions = FORMATIONS[value]
    if (!positions) return

    const { playerTokens } = this.data
    const updated = playerTokens.map((p, index) => {
      const preset = positions[index]
      if (preset) {
        return { ...p, x: preset.x, y: preset.y, posLabel: preset.posLabel }
      }
      return p
    })

    const unassignedCount = updated.filter(p => !p.posLabel).length
    this.setData({ selectedFormation: value, playerTokens: updated, unassignedCount })
    wx.showToast({ title: `已应用 ${value} 阵型`, icon: 'none' })
  },

  // 通过触摸拖拽移动token（简化版：选中后点击场地移动）
  onFieldTouch(e) {
    if (!this.data.editMode || !this.data.selectedPlayer) return
    
    const touch = e.touches[0]
    // 获取场地元素位置
    const query = wx.createSelectorQuery()
    query.select('#field').boundingClientRect(rect => {
      if (!rect) return
      const x = ((touch.clientX - rect.left) / rect.width) * 100
      const y = ((touch.clientY - rect.top) / rect.height) * 100

      // 限制在场地范围内
      const clampX = Math.max(5, Math.min(95, x))
      const clampY = Math.max(5, Math.min(95, y))

      const { playerTokens, selectedPlayer } = this.data
      const updated = playerTokens.map(p => {
        if (p.openid === selectedPlayer) {
          return { ...p, x: clampX, y: clampY }
        }
        return p
      })
      this.setData({ playerTokens: updated })
    }).exec()
  },

  onTokenTouchStart(e) {
    // 防止事件冒泡到场地
    e.stopPropagation && e.stopPropagation()
  },

  resetPositions() {
    wx.showModal({
      title: '确认重置',
      content: '重置后所有球员位置将恢复默认，是否继续？',
      success: (res) => {
        if (res.confirm) {
          const { playerTokens } = this.data
          const updated = playerTokens.map((p, index) => ({
            ...p,
            x: ((index % 5) + 1) * (100 / 6),
            y: 70 + Math.floor(index / 5) * 15,
            posLabel: ''
          }))
          this.setData({
            playerTokens: updated,
            unassignedCount: updated.length,
            selectedPlayer: null,
            selectedPlayerInfo: null
          })
        }
      }
    })
  }
})
