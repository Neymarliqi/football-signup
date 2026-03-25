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
    // 缓存过期时间（5分钟）
    cacheExpireTime: 5 * 60 * 1000
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

    this.getUserInfo()
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
        const cloudUserInfo = res.data
        this.globalData.userInfo = cloudUserInfo
        wx.setStorageSync('userInfo', cloudUserInfo)
        console.log('[syncUserInfoFromCloud] 已从云端同步用户信息', cloudUserInfo)
      } else {
        // 云端无数据，使用本地缓存（如果有）
        const localUserInfo = wx.getStorageSync('userInfo')
        if (localUserInfo) {
          this.globalData.userInfo = localUserInfo
        }
      }
    } catch (err) {
      // 获取失败（可能记录不存在），使用本地缓存
      console.log('[syncUserInfoFromCloud] 云端无用户记录，使用本地缓存')
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
   * 批量获取用户信息（带缓存）
   * @param {Array<string>} userIds - 用户 openid 数组
   * @returns {Promise<Object>} - 用户信息映射 { openid: userInfo }
   */
  async fetchUsersWithCache(userIds) {
    if (!userIds || userIds.length === 0) return {}

    const db = wx.cloud.database()
    const { usersCache, cacheExpireTime } = this.globalData
    const now = Date.now()
    const result = {}
    const uncachedIds = []

    // 先从缓存中查找
    userIds.forEach(id => {
      const cached = usersCache[id]
      if (cached && (now - cached.timestamp < cacheExpireTime)) {
        // 缓存有效，使用缓存
        result[id] = cached.data
      } else {
        // 缓存过期或不存在，需要查询
        uncachedIds.push(id)
      }
    })

    // 批量查询未缓存的用户
    if (uncachedIds.length > 0) {
      try {
        const batchSize = 20
        for (let i = 0; i < uncachedIds.length; i += batchSize) {
          const batch = uncachedIds.slice(i, i + batchSize)
          const res = await db.collection('users').where({
            _id: db.command.in(batch)
          }).get()

          // 更新缓存
          res.data.forEach(user => {
            result[user._id] = user
            usersCache[user._id] = {
              data: user,
              timestamp: now
            }
          })
        }
      } catch (e) {
        console.error('[fetchUsersWithCache] 查询用户信息失败', e)
      }
    }

    return result
  },

  /**
   * 清除单个用户的缓存
   * @param {string} userId - 用户 openid
   */
  clearUserCache(userId) {
    if (userId && this.globalData.usersCache) {
      delete this.globalData.usersCache[userId]
    }
  }
})
