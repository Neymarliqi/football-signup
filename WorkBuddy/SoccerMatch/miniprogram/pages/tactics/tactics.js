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
    isCreator: false,
    isParticipant: false,
    selectedPlayer: null,
    fieldRect: null,
    // 拖拽相关
    draggingPlayer: null,
    dragInfo: null,
    dragStartPos: null
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
        canEdit: isCreator || isParticipant,
        isCreator: isCreator,
        isParticipant: isParticipant,
        activity 
      })
      
      // 位置代码映射表 - 用于显示位置标签
      const posMap = {
        'ALL': '全能',
        'GK': '门将', 'LB': '左后', 'CB': '中后', 'RB': '右后',
        'LWB': '左翼', 'RWB': '右翼',
        'CDM': '后腰', 'CM': '中场', 'LM': '左中', 'RM': '右中',
        'CAM': '前腰', 'LW': '左锋', 'RW': '右锋',
        'ST': '中锋', 'CF': '前锋'
      }
      
      // 获取球员所有位置（按order排序），返回用/拼接的字符串
      const getPositionLabelString = (position) => {
        if (!position) return ''
        
        let posCodes = []
        if (typeof position === 'string') {
          // 旧格式：逗号分隔的字符串
          posCodes = position.split(/[,，\/\s]+/).filter(p => p.trim())
        } else if (Array.isArray(position)) {
          // 新格式：数组，按order排序
          const sorted = [...position].sort((a, b) => {
            const orderA = typeof a === 'object' ? (a.order || 99) : 99
            const orderB = typeof b === 'object' ? (b.order || 99) : 99
            return orderA - orderB
          })
          posCodes = sorted.map(p => typeof p === 'object' ? p.value : p)
        }
        
        // 转换为中文标签，每个标签取前2个字，用/拼接
        const labels = posCodes
          .map(code => {
            const label = posMap[code.trim().toUpperCase()] || code.trim()
            return label.substring(0, 2)
          })
          .filter(label => label)
        
        return labels.join('/')
      }

      // 获取所有报名用户的最新信息
      const confirmedRegs = registrations.filter(r => r.status === 'confirmed')
      const userIds = confirmedRegs.map(r => r.openid)

      // 批量获取最新用户信息（带缓存）
      let latestUsers = {}
      if (userIds.length > 0) {
        try {
          // 使用全局缓存系统
          latestUsers = await app.fetchUsersWithCache(userIds)
        } catch (e) {
          console.log('获取用户信息失败', e)
        }
      }
      
      // 获取已确认的球员（使用最新用户信息）
      const confirmedPlayers = confirmedRegs.map(r => {
        const latestUser = latestUsers[r.openid]
        return {
          openid: r.openid,
          nickName: latestUser?.nickName || r.nickName,
          shortName: this.getShortName(latestUser?.nickName || r.nickName),
          avatarUrl: latestUser?.avatarUrl || r.avatarUrl,
          positionLabel: getPositionLabelString(latestUser?.positions || r.position),
          isOnField: false,
          x: 50,
          y: 80
        }
      })
      
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
    // 取前8个字符，显示更多
    return nickName.length > 8 ? nickName.substring(0, 8) : nickName
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
  },



  // 保存战术
  async saveTactics() {
    if (!this.data.canEdit) {
      wx.showToast({ title: '暂无权限保存', icon: 'none' })
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

  // 开始拖拽
  onPlayerDragStart(e) {
    if (!this.data.canEdit) return

    const { openid, index, type } = e.currentTarget.dataset
    const { onFieldPlayers, benchPlayers } = this.data

    // 获取球员信息
    const player = type === 'onField'
      ? onFieldPlayers[index]
      : benchPlayers[index]

    if (!player) return

    // 获取触摸位置
    const touch = e.touches[0]

    // 获取球场位置
    const query = this.createSelectorQuery()
    query.select('#field').boundingClientRect()
    query.exec((res) => {
      if (res[0]) {
        this.setData({
          fieldRect: res[0],
          draggingPlayer: openid,
          dragStartPos: {
            x: touch.clientX,
            y: touch.clientY,
            playerX: player.x,
            playerY: player.y,
            type: type,
            index: index
          },
          dragInfo: {
            openid: player.openid,
            shortName: player.shortName,
            avatarUrl: player.avatarUrl,
            positionLabel: player.positionLabel || '',
            // 直接使用触摸位置，无偏移
            x: touch.clientX,
            y: touch.clientY
          }
        })
      }
    })
  },

  // 拖拽中
  onPlayerDragMove(e) {
    if (!this.data.draggingPlayer || !this.data.dragInfo) return

    const { clientX, clientY } = e.touches[0]

    this.setData({
      'dragInfo.x': clientX,
      'dragInfo.y': clientY
    })
  },

  // 结束拖拽
  onPlayerDragEnd(e) {
    if (!this.data.draggingPlayer || !this.data.dragStartPos) return
    
    const { fieldRect, onFieldPlayers, benchPlayers, dragStartPos } = this.data
    const { clientX, clientY } = e.changedTouches[0]
    
    // 判断是否在球场内
    const isInField = clientX >= fieldRect.left && 
                      clientX <= fieldRect.right &&
                      clientY >= fieldRect.top && 
                      clientY <= fieldRect.bottom
    
    if (isInField) {
      // 在球场内松开 - 放置到该位置
      const relativeX = ((clientX - fieldRect.left) / fieldRect.width) * 100
      const relativeY = ((clientY - fieldRect.top) / fieldRect.height) * 100
      
      // 限制在球场范围内
      const clampedX = Math.max(5, Math.min(95, relativeX))
      const clampedY = Math.max(5, Math.min(95, relativeY))
      
      if (dragStartPos.type === 'bench') {
        // 从替补区拖到球场 - 上场
        const player = benchPlayers[dragStartPos.index]
        const newOnFieldPlayer = {
          ...player,
          isOnField: true,
          x: clampedX,
          y: clampedY
        }
        
        // 替补自动往前排序（移除该球员）
        const newBenchPlayers = benchPlayers.filter((_, i) => i !== dragStartPos.index)
        
        this.setData({
          onFieldPlayers: [...onFieldPlayers, newOnFieldPlayer],
          benchPlayers: newBenchPlayers,
          draggingPlayer: null,
          dragInfo: null,
          dragStartPos: null
        })
        

      } else {
        // 从球场内拖动 - 更新位置
        const updatedPlayers = onFieldPlayers.map(p => {
          if (p.openid === this.data.draggingPlayer) {
            return { ...p, x: clampedX, y: clampedY }
          }
          return p
        })
        
        this.setData({
          onFieldPlayers: updatedPlayers,
          draggingPlayer: null,
          dragInfo: null,
          dragStartPos: null
        })
      }
    } else {
      // 不在球场内松开
      if (dragStartPos.type === 'onField') {
        // 从球场拖出 - 下场
        const player = onFieldPlayers[dragStartPos.index]
        
        // 从场上移除
        const newOnFieldPlayers = onFieldPlayers.filter((_, i) => i !== dragStartPos.index)
        
        // 添加到替补末尾
        const newBenchPlayers = [...benchPlayers, { ...player, isOnField: false }]
        
        this.setData({
          onFieldPlayers: newOnFieldPlayers,
          benchPlayers: newBenchPlayers,
          draggingPlayer: null,
          dragInfo: null,
          dragStartPos: null
        })
        

      } else {
        // 从替补区拖出但未进球场 - 回到原位
        this.setData({
          draggingPlayer: null,
          dragInfo: null,
          dragStartPos: null
        })
      }
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
