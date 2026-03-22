// pages/tactics/tactics.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    activityId: '',
    activity: null,
    allPlayers: [],
    onFieldPlayers: [],
    benchPlayers: [],
    canEdit: false,
    selectedPlayer: null,
    fieldRect: null
  },

  onLoad(options) {
    const { activityId } = options
    if (!activityId) {
      wx.showToast({ title: '参数错误', icon: 'error' })
      return
    }
    this.setData({ activityId })
    this.loadTactics()
  },

  async loadTactics() {
    const { activityId } = this.data
    const openid = app.globalData.openid || wx.getStorageSync('openid')
    
    wx.showLoading({ title: '加载中...' })
    
    try {
      // 获取活动信息
      const actRes = await db.collection('activities').doc(activityId).get()
      const activity = actRes.data
      
      // 检查权限
      const isCreator = activity.createdBy === openid
      const registrations = activity.registrations || []
      const isParticipant = registrations.some(r => r.openid === openid && r.status === 'confirmed')
      
      if (!isCreator && !isParticipant) {
        wx.hideLoading()
        wx.showModal({
          title: '提示',
          content: '只有报名成功的队员可以查看战术板',
          showCancel: false,
          success: () => wx.navigateBack()
        })
        return
      }
      
      this.setData({ 
        canEdit: isCreator,
        activity 
      })
      
      // 获取已确认的球员
      const confirmedPlayers = registrations
        .filter(r => r.status === 'confirmed')
        .map(r => ({
          openid: r.openid,
          nickName: r.nickName,
          shortName: this.getShortName(r.nickName),
          avatarUrl: r.avatarUrl,
          isOnField: false,
          x: 50,
          y: 80
        }))
      
      // 加载已保存的战术
      let savedPositions = {}
      try {
        const tacticRes = await db.collection('tactics').where({ activityId }).get()
        if (tacticRes.data.length > 0) {
          savedPositions = tacticRes.data[0].positions || {}
        }
      } catch (e) {}
      
      // 分配球员位置
      const allPlayers = confirmedPlayers.map((p, index) => {
        const saved = savedPositions[p.openid]
        if (saved) {
          return { ...p, isOnField: true, x: saved.x, y: saved.y }
        }
        return p
      })
      
      const onFieldPlayers = allPlayers.filter(p => p.isOnField)
      const benchPlayers = allPlayers.filter(p => !p.isOnField)
      
      this.setData({ allPlayers, onFieldPlayers, benchPlayers })
      
      // 获取球场位置信息
      this.getFieldRect()
      
    } catch (e) {
      console.error('加载失败', e)
      wx.showToast({ title: '加载失败', icon: 'error' })
    } finally {
      wx.hideLoading()
    }
  },

  getFieldRect() {
    const query = this.createSelectorQuery()
    query.select('#field').boundingClientRect()
    query.exec((res) => {
      if (res[0]) {
        this.setData({ fieldRect: res[0] })
      }
    })
  },

  getShortName(nickName) {
    if (!nickName) return '未知'
    // 取前4个字符，避免太长
    return nickName.length > 4 ? nickName.substring(0, 4) : nickName
  },

  // 点击球场空白处 - 移动选中的球员
  onFieldTap(e) {
    if (!this.data.canEdit) return
    
    const { selectedPlayer, onFieldPlayers, fieldRect } = this.data
    
    // 如果没有选中球员，不做任何事
    if (!selectedPlayer) return
    
    // 获取点击位置
    const { x, y } = e.detail
    
    if (!fieldRect) {
      this.getFieldRect()
      return
    }
    
    // 计算相对球场的百分比位置
    const relativeX = ((x - fieldRect.left) / fieldRect.width) * 100
    const relativeY = ((y - fieldRect.top) / fieldRect.height) * 100
    
    // 限制在球场范围内
    const clampedX = Math.max(5, Math.min(95, relativeX))
    const clampedY = Math.max(5, Math.min(95, relativeY))
    
    // 更新球员位置
    const updatedPlayers = onFieldPlayers.map(p => {
      if (p.openid === selectedPlayer) {
        return { ...p, x: clampedX, y: clampedY }
      }
      return p
    })
    
    this.setData({ 
      onFieldPlayers: updatedPlayers,
      selectedPlayer: null
    })
  },

  // 点击场上球员 - 选中/取消选中
  onPlayerTap(e) {
    if (!this.data.canEdit) return
    
    const { openid } = e.currentTarget.dataset
    const { selectedPlayer } = this.data
    
    // 如果点击的是已选中的球员，取消选中
    if (selectedPlayer === openid) {
      this.setData({ selectedPlayer: null })
    } else {
      // 选中该球员
      this.setData({ selectedPlayer: openid })
    }
    
    // 阻止冒泡
    e.stopPropagation()
  },

  // 长按场上球员 - 下场
  onPlayerLongPress(e) {
    if (!this.data.canEdit) return
    
    const { openid, index } = e.currentTarget.dataset
    const { onFieldPlayers, benchPlayers } = this.data
    
    // 找到该球员
    const player = onFieldPlayers.find(p => p.openid === openid)
    if (!player) return
    
    // 移回替补席
    const updatedOnField = onFieldPlayers.filter(p => p.openid !== openid)
    const updatedBench = [...benchPlayers, { ...player, isOnField: false }]
    
    this.setData({
      onFieldPlayers: updatedOnField,
      benchPlayers: updatedBench,
      selectedPlayer: null
    })
    
    wx.showToast({ title: '已下场', icon: 'none' })
    
    e.stopPropagation()
  },

  // 点击替补球员 - 上场
  addToField(e) {
    if (!this.data.canEdit) {
      wx.showToast({ title: '只有队长可以编辑', icon: 'none' })
      return
    }
    
    const player = e.currentTarget.dataset.player
    const { onFieldPlayers, benchPlayers } = this.data
    
    // 默认放在球场底部中间
    const defaultX = 50
    const defaultY = 85
    
    // 如果有其他球员，稍微错开位置
    const offsetX = (onFieldPlayers.length % 3 - 1) * 15
    const offsetY = Math.floor(onFieldPlayers.length / 3) * 10
    
    const newPlayer = {
      ...player,
      isOnField: true,
      x: defaultX + offsetX,
      y: Math.max(20, defaultY - offsetY)
    }
    
    this.setData({
      onFieldPlayers: [...onFieldPlayers, newPlayer],
      benchPlayers: benchPlayers.filter(p => p.openid !== player.openid),
      selectedPlayer: player.openid
    })
    
    wx.showToast({ title: '已上场', icon: 'none' })
  },



  // 保存战术
  async saveTactics() {
    if (!this.data.canEdit) {
      wx.showToast({ title: '只有队长可以保存', icon: 'none' })
      return
    }
    
    const { activityId, onFieldPlayers } = this.data
    
    // 构建位置数据
    const positions = {}
    onFieldPlayers.forEach(p => {
      positions[p.openid] = { x: p.x, y: p.y }
    })
    
    wx.showLoading({ title: '保存中...' })
    
    try {
      const existing = await db.collection('tactics').where({ activityId }).get()
      
      if (existing.data.length > 0) {
        await db.collection('tactics').doc(existing.data[0]._id).update({
          data: { 
            positions, 
            updatedAt: db.serverDate() 
          }
        })
      } else {
        await db.collection('tactics').add({
          data: { 
            activityId, 
            positions, 
            createdAt: db.serverDate() 
          }
        })
      }
      
      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (e) {
      console.error('保存失败', e)
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'error' })
    }
  },

  // 返回
  goBack() {
    wx.navigateBack()
  },

  onShareAppMessage() {
    const { activity } = this.data
    return {
      title: `${activity?.title || '活动'} - 战术板`,
      path: `/pages/tactics/tactics?activityId=${this.data.activityId}`
    }
  }
})
