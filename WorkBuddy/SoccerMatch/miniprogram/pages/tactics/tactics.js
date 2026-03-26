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

  onShow() {
    // 每次显示时强制刷新用户信息，确保看到最新头像
    const { activityId } = this.data
    if (activityId && this.data.activity) {
      this.refreshUsersInfo()
    }
  },

  async refreshUsersInfo() {
    const { activity, activityId } = this.data
    if (!activity) return

    try {
      const confirmedRegs = activity.registrations?.filter(r => r.status === 'confirmed') || []
      const userIds = confirmedRegs.map(r => r.openid)

      if (userIds.length > 0) {
        // 强制刷新用户缓存
        const latestUsers = await app.fetchUsersWithCache(userIds, true) // true = 强制刷新

        // 重新构建球员列表
        const posMap = {
          'ALL': '全能',
          'GK': '门将', 'LB': '左后', 'CB': '中后', 'RB': '右后',
          'LWB': '左翼', 'RWB': '右翼',
          'CDM': '后腰', 'CM': '中场', 'LM': '左中', 'RM': '右中',
          'CAM': '前腰', 'LW': '左锋', 'RW': '右锋',
          'ST': '中锋', 'CF': '前锋'
        }

        const getPositionLabelString = (position) => {
          if (!position) return ''
          let posCodes = []
          if (typeof position === 'string') {
            posCodes = position.split(/[,，\/\s]+/).filter(p => p.trim())
          } else if (Array.isArray(position)) {
            const sorted = [...position].sort((a, b) => {
              const orderA = typeof a === 'object' ? (a.order || 99) : 99
              const orderB = typeof b === 'object' ? (b.order || 99) : 99
              return orderA - orderB
            })
            posCodes = sorted.map(p => typeof p === 'object' ? p.value : p)
          }
          const labels = posCodes.map(code => {
            const label = posMap[code.trim().toUpperCase()] || code.trim()
            return label.substring(0, 2)
          }).filter(label => label)
          return labels.join('/')
        }

        // base64 直接用，不走云存储权限
        const confirmedPlayers = confirmedRegs.map(r => {
          const latestUser = latestUsers[r.openid]
          return {
            openid: r.openid,
            nickName: latestUser?.nickName || r.nickName,
            shortName: this.getShortName(latestUser?.nickName || r.nickName),
            avatarUrl: app.getDisplayAvatar(latestUser) || app.globalData.defaultAvatar,
            positionLabel: getPositionLabelString(latestUser?.positions || r.position),
            isOnField: false,
            x: 50,
            y: 80
          }
        })

        // 保持现有位置状态，只更新用户信息
        const currentOnField = this.data.onFieldPlayers
        const currentBench = this.data.benchPlayers

        const newOnField = confirmedPlayers.map(p => {
          const existing = currentOnField.find(fp => fp.openid === p.openid)
          if (existing) {
            return { ...p, isOnField: true, x: existing.x, y: existing.y }
          }
          return p
        })

        const newBench = confirmedPlayers
          .filter(p => !newOnField.find(fp => fp.openid === p.openid))
          .map(p => {
            const existing = currentBench.find(bp => bp.openid === p.openid)
            return { ...p, isOnField: false }
          })

        this.setData({
          onFieldPlayers: newOnField,
          benchPlayers: newBench
        })

      }
    } catch (e) {
      console.error('[refreshUsersInfo] 刷新用户信息失败', e)
    }
  },

  async loadTactics() {
    const { activityId } = this.data
    const openid = app.globalData.openid || wx.getStorageSync('openid')
    
    wx.showLoading({ title: '加载中...' })
    
    try {
      // 获取活动信息
      const actRes = await db.collection('activities').doc(activityId).get()
      const activity = actRes.data
      
      // 检查权限（所有人可查看，只有报名者和创建者可编辑保存）
      const isCreator = activity.createdBy === openid
      const registrations = activity.registrations || []
      const isParticipant = registrations.some(r => r.openid === openid && r.status === 'confirmed')
      
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
        }
      }
      
      // 获取已确认的球员（使用最新用户信息）
      // base64 直接用，不走云存储权限
      const confirmedPlayers = confirmedRegs.map(r => {
        const latestUser = latestUsers[r.openid]
        return {
          openid: r.openid,
          nickName: latestUser?.nickName || r.nickName,
          shortName: this.getShortName(latestUser?.nickName || r.nickName),
          avatarUrl: app.getDisplayAvatar(latestUser) || app.globalData.defaultAvatar,
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
    return nickName.length > 8 ? nickName.substring(0, 8) : nickName
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
