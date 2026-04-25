// app.js
App({
  globalData: {
    userInfo: null,
    openid: '',
    isAdmin: false,
    // 默认管理员 openid 列表（实际项目中应存储在云数据库中）
    adminList: [],
    // 全局用户信息缓存（减少数据库查询）
    usersCache: {},
    // 缓存过期时间（1分钟 - 缩短以提升实时性）
    cacheExpireTime: 1 * 60 * 1000,
    // 注册回调队列：用户完成注册后依次执行
    _registerCallbacks: [],
    // 默认头像（本地路径，保证所有设备都能加载）
    defaultAvatar: '/images/default-avatar.png',
    // cloud:// fileID → HTTPS URL 的映射缓存
    _fileUrlCache: {}
  },

  onLaunch() {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'cloud1-5gbn5i1p97239e9d', // 替换为你的云开发环境ID
        traceUser: true,
      })
    }

    // 同步初始化本地缓存（不等云函数，解决页面 onShow 先于云函数返回的时序问题）
    const cachedOpenid = wx.getStorageSync('openid')
    if (cachedOpenid) {
      this.globalData.openid = cachedOpenid
    }
    const cachedUserInfo = wx.getStorageSync('userInfo')
    if (cachedUserInfo) {
      this.globalData.userInfo = cachedUserInfo
    }

    // 同步读用户头像性能缓存到内存（冷启动秒可用）
    this._initUserCacheFromStorage()

    this.getUserInfo()
  },

  // 从本地 Storage 初始化用户头像缓存到内存（冷启动时调用一次）
  _initUserCacheFromStorage() {
    try {
      const info = wx.getStorageInfoSync()
      const userKeys = (info.keys || []).filter(k => k.startsWith('user_'))
      const now = Date.now()
      userKeys.forEach(key => {
        try {
          const data = wx.getStorageSync(key)
          if (data && data.cachedAt) {
            const openid = key.replace('user_', '')
            this.globalData.usersCache[openid] = {
              data: {
                nickName: data.nickName,
                cloudPath: data.cloudPath || '',
                avatarBase64: data.avatarBase64 || '',
                positions: data.positions || [],
                openid
              },
              timestamp: now
            }
          }
        } catch (e) {}
      })
    } catch (e) {}
  },

  getUserInfo() {
    // 获取 openid
    wx.cloud.callFunction({
      name: 'getOpenid',
      success: res => {
        const openid = res.result.openid
        this.globalData.openid = openid
        wx.setStorageSync('openid', openid)

        // 从云端获取最新用户信息（确保多设备同步）
        this.syncUserInfoFromCloud(openid)

        // 检查是否是管理员
        this.checkAdmin(openid)
      },
      fail: err => {
        console.error('获取openid失败', err)
        // 离线模式：从缓存读取
        const cachedOpenid = wx.getStorageSync('openid')
        if (cachedOpenid) {
          this.globalData.openid = cachedOpenid
          // 离线模式下使用本地缓存的用户信息
          const userInfo = wx.getStorageSync('userInfo')
          if (userInfo) {
            this.globalData.userInfo = userInfo
          }
        }
      }
    })
  },

  // 从云端同步最新用户信息
  async syncUserInfoFromCloud(openid) {
    const db = wx.cloud.database()
    try {
      const res = await db.collection('users').doc(openid).get()
      if (res.data) {
        // 云端有数据，使用云端最新数据
        this.globalData.userInfo = res.data
        wx.setStorageSync('userInfo', res.data)
        // 云端有数据说明已注册，写入永久注册标记
        wx.setStorageSync('user_registered', true)
        // 用户已注册，执行回调队列
        this._executeRegisterCallbacks()
      } else {
        // 云端无数据，使用本地缓存（如果有）
        const localUserInfo = wx.getStorageSync('userInfo')
        if (localUserInfo) {
          this.globalData.userInfo = localUserInfo
        }
      }
    } catch (err) {
      // 获取失败（记录不存在），本地有注册标记就用本地数据
      const localUserInfo = wx.getStorageSync('userInfo')
      if (localUserInfo) {
        this.globalData.userInfo = localUserInfo
      }
    }
  },

  checkAdmin(openid) {
    const db = wx.cloud.database()
    db.collection('admins').where({ openid }).get({
      success: res => {
        if (res.data && res.data.length > 0) {
          this.globalData.isAdmin = true
        }
      }
    })
  },

  /**
   * 批量获取用户信息（三层缓存：内存 → Storage → 数据库）
   * @param {Array<string>} userIds - 用户 openid 数组
   * @param {boolean} forceRefresh - 是否强制刷新缓存（默认 false）
   * @returns {Promise<Object>} - 用户信息映射 { openid: userInfo }
   */
  async fetchUsersWithCache(userIds, forceRefresh = false) {
    if (!userIds || userIds.length === 0) return {}

    const db = wx.cloud.database()
    const { usersCache, cacheExpireTime } = this.globalData
    const now = Date.now()
    const result = {}
    const uncachedIds = []

    // 第一层：内存缓存
    userIds.forEach(id => {
      const cached = usersCache[id]
      if (cached && (now - cached.timestamp < cacheExpireTime) && !forceRefresh) {
        result[id] = cached.data
      } else {
        uncachedIds.push(id)
      }
    })

    // 第二层：本地 Storage 缓存（冷启动可用）
    const stillUncached = []
    uncachedIds.forEach(id => {
      if (forceRefresh) {
        stillUncached.push(id)
        return
      }
      try {
        const storageData = wx.getStorageSync(`user_${id}`)
        if (storageData && storageData.cachedAt) {
          // Storage 命中 → 回填内存缓存 + 返回结果
          result[id] = {
            nickName: storageData.nickName,
            cloudPath: storageData.cloudPath || '',
            avatarBase64: storageData.avatarBase64 || '',
            positions: storageData.positions || [],
            openid: id,
            _fromStorage: true // 标记来源，便于调试
          }
          usersCache[id] = { data: result[id], timestamp: now }
        } else {
          stillUncached.push(id)
        }
      } catch (e) {
        stillUncached.push(id)
      }
    })

    // 第三层：数据库查询
    if (stillUncached.length > 0) {
      try {
        const batchSize = 20
        for (let i = 0; i < stillUncached.length; i += batchSize) {
          const batch = stillUncached.slice(i, i + batchSize)
          const res = await db.collection('users').where({
            openid: db.command.in(batch)
          }).get()

          // 去重：同一 openid 可能有多条记录，按 updatedAt 取最新
          const deduped = {}
          res.data.forEach(user => {
            const key = user.openid
            if (!key) return
            const existing = deduped[key]
            if (!existing) {
              deduped[key] = user
            } else {
              const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0
              const newTime = user.updatedAt ? new Date(user.updatedAt).getTime() : 0
              if (newTime > existingTime) {
                deduped[key] = user
              }
            }
          })

          // 批量解析头像 URL（一次性获取，避免逐个调用 getTempFileURL）
          const usersWithCloudPath = Object.values(deduped).filter(u => u.cloudPath)
          if (usersWithCloudPath.length > 0) {
            try {
              // cloudPath 现在存的就是完整 fileID，直接用
              const fileList = usersWithCloudPath.map(u => u.cloudPath)
              const fileRes = await wx.cloud.getTempFileURL({ fileList })
              if (fileRes.fileList) {
                // fileList 顺序与 usersWithCloudPath 一致，用索引对应
                fileRes.fileList.forEach((item, index) => {
                  if (item.status === 0 && item.tempFileURL) {
                    usersWithCloudPath[index].displayAvatar = item.tempFileURL
                  }
                })
              }
            } catch (e) {
              // 头像 URL 解析失败不影响用户数据
              console.warn('[fetchUsersWithCache] 批量解析头像URL失败:', e)
            }
          }

          // 写入结果 + 双层缓存（内存 + Storage）
          Object.values(deduped).forEach(user => {
            result[user.openid] = user
            // 内存缓存
            usersCache[user.openid] = { data: user, timestamp: now }
            // Storage 缓存
            this.saveUserToStorage(user.openid, user)
          })
        }

        const foundIds = Object.keys(result)
        const notFoundIds = stillUncached.filter(id => !foundIds.includes(id))
        if (notFoundIds.length > 0) {
          console.warn('[fetchUsersWithCache] 以下用户ID未查询到数据:', notFoundIds)
        }
      } catch (e) {
        console.error('[fetchUsersWithCache] 查询用户信息失败', e)
      }
    }

    return result
  },

  /**
   * 将单个用户信息写入本地 Storage 缓存
   * @param {string} openid - 用户 openid
   * @param {Object} userData - 用户数据
   */
  saveUserToStorage(openid, userData) {
    try {
      wx.setStorageSync(`user_${openid}`, {
        nickName: userData.nickName || '',
        cloudPath: userData.cloudPath || '',
        avatarBase64: userData.avatarBase64 || '',
        positions: userData.positions || [],
        cachedAt: Date.now()
      })
      // 写入后检查是否需要清理（低频操作，不阻塞）
      this.cleanupUserStorage()
    } catch (e) {
      // Storage 写入失败，忽略
    }
  },

  /**
   * 清理过期/超量的用户 Storage 缓存
   * - 30天未更新：自动删除
   * - 总量超 8MB：删除最旧的 20%
   */
  cleanupUserStorage() {
    try {
      const info = wx.getStorageInfoSync()
      const allKeys = info.keys || []
      const userKeys = allKeys.filter(k => k.startsWith('user_'))

      if (userKeys.length === 0) return

      const now = Date.now()
      const EXPIRE_MS = 30 * 24 * 60 * 60 * 1000 // 30天
      const MAX_SIZE = 8 * 1024 * 1024 // 8MB
      const toDelete = []

      // 第一重：清理超过 30 天的
      userKeys.forEach(key => {
        try {
          const data = wx.getStorageSync(key)
          if (data && data.cachedAt && (now - data.cachedAt > EXPIRE_MS)) {
            toDelete.push(key)
          }
        } catch (e) {
          toDelete.push(key) // 读取失败的数据也清理
        }
      })

      // 第二重：总量超 8MB，按 cachedAt 排序删除最旧的 20%
      if (info.currentSize * 1024 > MAX_SIZE) {
        const remaining = userKeys.filter(k => !toDelete.includes(k))
        if (remaining.length > 0) {
          const items = []
          remaining.forEach(key => {
            try {
              const data = wx.getStorageSync(key)
              if (data && data.cachedAt) {
                items.push({ key, cachedAt: data.cachedAt })
              }
            } catch (e) {
              items.push({ key, cachedAt: 0 })
            }
          })
          items.sort((a, b) => a.cachedAt - b.cachedAt)
          const deleteCount = Math.ceil(items.length * 0.2)
          for (let i = 0; i < deleteCount; i++) {
            toDelete.push(items[i].key)
          }
        }
      }

      // 执行删除
      if (toDelete.length > 0) {
        toDelete.forEach(key => {
          try { wx.removeStorageSync(key) } catch (e) {}
        })
      }
    } catch (e) {
      // 清理失败不影响业务，忽略
    }
  },

  /**
   * 清除单个用户的缓存（内存 + Storage 双层清理）
   * @param {string} userId - 用户 openid
   */
  clearUserCache(userId) {
    if (!userId) return
    // 内存缓存
    if (this.globalData.usersCache) {
      delete this.globalData.usersCache[userId]
    }
    // Storage 缓存（下次 fetchUsersWithCache 会强制查数据库）
    try {
      wx.removeStorageSync(`user_${userId}`)
    } catch (e) {}
  },

  /**
   * 处理头像：压缩后上传至云存储（v2.2.0 云存储方案）
   * @param {string} tempPath - 原始头像路径（chooseAvatar 返回的临时路径）
   * @param {string} [openid] - 可选，默认取当前用户 openid
   * @returns {Promise<string>} cloudPath（云存储路径，如 avatars/xxx.jpg）
   */
  async uploadAvatar(tempPath, openid) {
    if (!tempPath) return ''

    // 已经是 cloudPath，直接返回（兼容旧数据）
    if (tempPath.startsWith('cloud://')) return tempPath

    // 已经是 base64，不走云存储（懒迁移：旧 base64 用户暂不迁移）
    if (tempPath.startsWith('data:image')) return ''

    let filePath = tempPath

    // http://tmp/ 临时路径需先转为持久路径
    if (tempPath.startsWith('http://tmp/') || tempPath.startsWith('http://tmp\\')) {
      try {
        const fs = wx.getFileSystemManager()
        const savedPath = `${wx.env.USER_DATA_PATH}/avatar_${Date.now()}.jpg`
        fs.saveFileSync(tempPath, savedPath)
        filePath = savedPath
      } catch (e) {
        console.error('[uploadAvatar] 保存临时文件失败', e)
        return ''
      }
    }

    // 压缩图片
    const compressedPath = await this._compressAvatar(filePath)
    if (!compressedPath) return ''

    // 上传到云存储
    const uid = openid || this.globalData.openid || wx.getStorageSync('openid')
    if (!uid) return ''

    const cloudPath = `avatars/${uid}.jpg`

    try {
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: compressedPath
      })
      // 保存完整 fileID（如 cloud://cloud1-5gbn5i1p97239e9d.636c-xxx/avatars/xxx.jpg）
      // getTempFileURL 需要完整的 fileID 格式
      const fullFileID = uploadRes.fileID
      return fullFileID
    } catch (e) {
      console.error('[uploadAvatar] 云存储上传失败', e)
      return ''
    }
  },

  /**
   * 压缩头像图片（内部方法，供 uploadAvatar 使用）
   * @param {string} filePath - 图片文件路径
   * @returns {Promise<string>} 压缩后的临时文件路径
   */
  _compressAvatar(filePath) {
    return new Promise((resolve) => {
      wx.compressImage({
        src: filePath,
        quality: 70,
        compressedWidth: 200,
        compressedHeight: 200,
        success: (res) => resolve(res.tempFilePath),
        fail: () => resolve(filePath) // 降级：使用原文件
      })
    })
  },

  /**
   * 获取用户可显示的头像URL（同步）
   * 优先级：预解析 displayAvatar > avatarBase64 > cloudPath（需 getTempFileURL） > 默认头像
   * @param {Object} user - 用户信息对象
   * @returns {string} 可直接用于 <image src> 的 URL
   */
  getDisplayAvatar(user) {
    if (!user) return this.globalData.defaultAvatar

    // 优先：fetchUsersWithCache 已预解析的临时 URL（有效期约2小时）
    if (user.displayAvatar) return user.displayAvatar
    if (user.avatarBase64) return user.avatarBase64
    // cloudPath 需通过 getTempFileURL 转成 HTTPS 才能被 image 组件加载
    if (user.cloudPath) {
      return this._resolveCloudPath(user.cloudPath)
    }
    return this.globalData.defaultAvatar
  },

  /**
   * 将 cloud:// 文件ID 转成 HTTPS 临时 URL（同步，异步获取后缓存）
   * @param {string} cloudFileID - 完整的 cloud:// 文件ID
   * @returns {string} HTTPS URL 或原始 fileID（失败时降级）
   */
  _resolveCloudPath(cloudFileID) {
    const cached = this.globalData._fileUrlCache
    if (cached[cloudFileID]) return cached[cloudFileID]
    // 同步返回 fileID，异步获取后下次生效
    wx.cloud.getTempFileURL({ fileList: [cloudFileID] }).then(res => {
      if (res.fileList && res.fileList[0].status === 0) {
        cached[cloudFileID] = res.fileList[0].tempFileURL
      }
    }).catch(() => {})
    return cloudFileID
  },

  /**
   * 批量获取用户可显示的头像URL（同步，优先 base64）
   * @param {Object[]} users - 用户信息对象数组
   * @returns {string[]} 可直接用于 <image src> 的URL数组
   */
  getDisplayAvatars(users) {
    if (!users || users.length === 0) return []
    return users.map(user => this.getDisplayAvatar(user))
  },

  /**
   * 检查当前用户是否已注册（有用户记录含 nickName）
   * @returns {Object|null} 返回用户信息对象，未注册则返回 null
   */
  async ensureUserCreated() {
    const openid = this.globalData.openid || wx.getStorageSync('openid')
    if (!openid) return null

    // 先查本地
    const userInfo = this.globalData.userInfo || wx.getStorageSync('userInfo')
    if (userInfo && userInfo.nickName) {
      return userInfo
    }

    // 再查云端
    const db = wx.cloud.database()
    try {
      const res = await db.collection('users').doc(openid).get()
      if (res.data && res.data.nickName) {
        this.globalData.userInfo = res.data
        wx.setStorageSync('userInfo', res.data)
        return res.data
      }
    } catch (e) {
      // 记录不存在
    }

    return null
  },

  /**
   * 检查当前用户是否已注册
   * @returns {boolean} 是否已注册
   */
  isUserRegistered() {
    // 优先读本地永久注册标记（不等网络，秒级判断）
    const registered = wx.getStorageSync('user_registered')
    if (registered) return true

    // 兼容旧版：本地有 userInfo 且有 nickName 也算已注册
    const userInfo = this.globalData.userInfo || wx.getStorageSync('userInfo')
    if (userInfo && userInfo.nickName) {
      // 补写永久标记，后续不再走这个兼容逻辑
      wx.setStorageSync('user_registered', true)
      return true
    }

    return false
  },

  /**
   * 注册回调：用户完成注册后自动执行
   * @param {Function} callback - 注册完成后执行的回调
   */
  onUserRegistered(callback) {
    // 如果用户已注册，立即执行
    if (this.isUserRegistered()) {
      callback()
      return
    }
    // 否则加入回调队列
    this.globalData._registerCallbacks.push(callback)
  },

  /**
   * 执行注册回调队列（注册完成后调用）
   */
  _executeRegisterCallbacks() {
    const callbacks = this.globalData._registerCallbacks
    this.globalData._registerCallbacks = []
    callbacks.forEach(cb => {
      try { cb() } catch (e) { console.error('[app] 注册回调执行失败', e) }
    })
  },

  /**
   * 创建用户记录（新用户首次填写头像昵称后调用）
   * @param {string} nickName - 昵称
   * @param {string} cloudPath - 头像云存储路径（avatars/xxx.jpg），空字符串表示不上传头像
   * @param {string[]} positions - 位置偏好
   * @returns {Promise<Object>} 创建后的用户信息
   */
  async createUser(nickName, cloudPath, positions = []) {
    const openid = this.globalData.openid || wx.getStorageSync('openid')
    if (!openid) throw new Error('openid 不存在')

    const db = wx.cloud.database()

    const userInfo = {
      openid,
      nickName,
      cloudPath: cloudPath || '',
      positions,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }

    await db.collection('users').doc(openid).set({ data: userInfo })

    // 更新全局状态
    this.globalData.userInfo = userInfo
    wx.setStorageSync('userInfo', userInfo)
    // 写入永久注册标记（只有删小程序才会消失）
    wx.setStorageSync('user_registered', true)

    // 清除缓存
    this.clearUserCache(openid)

    // 执行注册回调队列
    this._executeRegisterCallbacks()
  },

  // ========== 活动模板相关 ==========
  // Storage key
  _TPL_KEY: 'activity_templates',

  /**
   * 加载所有模板
   * @returns {Array} 模板数组
   */
  loadTemplates() {
    try {
      const raw = wx.getStorageSync(this._TPL_KEY)
      if (!raw) return []
      const list = typeof raw === 'string' ? JSON.parse(raw) : raw
      // 按创建时间倒序
      return list.sort((a, b) => b.createdAt - a.createdAt)
    } catch (e) {
      return []
    }
  },

  /**
   * 保存一个新模板
   * @param {Object} templateData - 模板数据（不含 id/createdAt）
   * @returns {Object} 新建的模板（含 id/createdAt）
   */
  saveTemplate(templateData) {
    const tpl = {
      ...templateData,
      id: 'tpl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      createdAt: Date.now()
    }
    const list = this.loadTemplates()
    list.unshift(tpl)
    wx.setStorageSync(this._TPL_KEY, list)
    return tpl
  },

  /**
   * 删除指定模板
   * @param {string} id - 模板 id
   */
  deleteTemplate(id) {
    const list = this.loadTemplates()
    const filtered = list.filter(t => t.id !== id)
    wx.setStorageSync(this._TPL_KEY, filtered)
  },

  /**
   * 更新模板指定字段
   * @param {string} id - 模板 id
   * @param {Object} updates - 要更新的字段（如 { name: '新名称' }）
   */
  updateTemplate(id, updates) {
    const list = this.loadTemplates()
    const idx = list.findIndex(t => t.id === id)
    if (idx === -1) return
    list[idx] = { ...list[idx], ...updates }
    wx.setStorageSync(this._TPL_KEY, list)
  },

  /**
   * 根据 id 获取模板
   * @param {string} id - 模板 id
   * @returns {Object|null}
   */
  getTemplateById(id) {
    const list = this.loadTemplates()
    return list.find(t => t.id === id) || null
  },

  /**
   * 计算下一个指定周几的日期
   * @param {number} weekday - 0=周日, 1=周一, ..., 6=周六
   * @returns {string} YYYY-MM-DD 格式的日期字符串
   */
  calcNextWeekday(weekday) {
    const now = new Date()
    const todayDow = now.getDay() // 0=周日
    let daysToAdd = weekday - todayDow
    if (daysToAdd <= 0) daysToAdd += 7
    const d = new Date(now)
    d.setDate(d.getDate() + daysToAdd)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  },

  /**
   * 将模板数据应用到表单
   * @param {Object} template - 模板对象
   * @returns {Object} 可直接 setData 的 form 对象
   */
  applyTemplateToForm(template) {
    const date = this.calcNextWeekday(template.weekday)
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const weekdayLabel = weekdays[template.weekday]

    return {
      // 球队
      teamId: template.teamId || '',
      teamName: template.teamName || '',
      // 时间
      date,
      dateWeekday: weekdayLabel,
      startTime: template.startTime || '19:00',
      endTime: template.endTime || '21:00',
      // 截止时间（直接用模板存的 selectedDeadline 字符串）
      selectedDeadline: template.selectedDeadline || 'none',
      // 其他字段
      title: template.title || '',
      description: template.description || '',
      matchType: template.matchType || '友谊赛',
      customMatchType: false,
      customMatchTypeText: '',
      visibility: template.visibility || 'open',
      locationName: template.locationName || '',
      location: template.location || '',
      maxPlayers: template.maxPlayers || 16,
      fee: template.fee || 0,
      autoConfirm: template.autoConfirm || false,
      customMatchTypes: template.customMatchTypes || []
    }
  },

  /**
   * 从表单数据中提取模板字段（不含 id/createdAt）
   * @param {Object} form - 表单数据
   * @returns {Object}
   */
  extractTemplateData(form) {
    // 从 date 反推 weekday
    if (form.date) {
      const d = new Date(form.date + 'T00:00:00')
      form._weekday = d.getDay()
    }
    return {
      teamId: form.teamId || '',
      teamName: form.teamName || '',
      weekday: form._weekday != null ? form._weekday : (form.date ? new Date(form.date + 'T00:00:00').getDay() : 6),
      startTime: form.startTime || '',
      endTime: form.endTime || '',
      // 直接存 selectedDeadline 字符串，避免 'none' 转 null 丢失原始值
      selectedDeadline: form.selectedDeadline || 'none',
      title: form.title || '',
      description: form.description || '',
      matchType: form.matchType || '友谊赛',
      visibility: form.visibility || 'open',
      locationName: form.locationName || '',
      location: form.location || '',
      maxPlayers: form.maxPlayers || 16,
      fee: form.fee || 0,
      autoConfirm: form.autoConfirm || false,
      customMatchTypes: form.customMatchTypes || []
    }
  }
})
