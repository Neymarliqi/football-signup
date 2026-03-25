// custom-tab-bar/index.js
Component({
  data: {
    selected: 0,
    isIPX: false
  },

  attached() {
    // 检测是否为iPhoneX及以上机型（有底部安全区域）
    const systemInfo = wx.getSystemInfoSync()
    const isIPX = systemInfo.safeArea && systemInfo.safeArea.bottom < systemInfo.screenHeight
    this.setData({ isIPX })
  },

  methods: {
    // 切换Tab
    switchTab(e) {
      const index = parseInt(e.currentTarget.dataset.index)
      
      // 只有切换到不同页面时才执行
      if (this.data.selected !== index) {
        const url = index === 0 ? '/pages/index/index' : '/pages/profile/profile'
        
        wx.switchTab({
          url,
          success: () => {
            this.setData({ selected: index })
          },
          fail: (err) => {
            console.error('切换Tab失败:', err)
            wx.showToast({
              title: '页面切换失败',
              icon: 'none'
            })
          }
        })
      }
    },

    // 跳转到发布页面
    goToPublish() {
      // 使用 navigateTo 跳转到非 tabBar 页面
      wx.navigateTo({
        url: '/pages/activity/create',
        fail: (err) => {
          console.error('跳转发布页面失败:', err)
          wx.showToast({
            title: '跳转失败',
            icon: 'none'
          })
        }
      })
    }
  }
})
