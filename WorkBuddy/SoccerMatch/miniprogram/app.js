// app.js
App({
  globalData: {
    userInfo: null,
    openid: '',
    isAdmin: false,
    // 默认管理员 openid 列表（实际项目中应存储在云数据库中）
    adminList: []
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
    // 从本地缓存读取用户信息（优先使用本地最新数据）
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      this.globalData.userInfo = userInfo
    }

    // 获取 openid
    wx.cloud.callFunction({
      name: 'getOpenid',
      success: res => {
        const openid = res.result.openid
        this.globalData.openid = openid
        wx.setStorageSync('openid', openid)

        // 检查是否是管理员
        this.checkAdmin(openid)
      },
      fail: err => {
        console.error('获取openid失败', err)
        // 离线模式：从缓存读取
        const cachedOpenid = wx.getStorageSync('openid')
        if (cachedOpenid) {
          this.globalData.openid = cachedOpenid
        }
      }
    })
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
  }
})
