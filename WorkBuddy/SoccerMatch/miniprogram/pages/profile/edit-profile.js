// pages/profile/edit-profile.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    userInfo: {},
    tempAvatarUrl: '',
    tempNickName: '',
    wechatUserInfo: {},
    placeholderAvatar: '/images/default-avatar.png'
  },

  onLoad() {
    this.loadUserInfo()
  },

  loadUserInfo() {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || {}
    // 计算可显示的头像（支持 cloudPath / base64 / cloud:// 兼容）
    userInfo.displayAvatar = app.getDisplayAvatar(userInfo)
    this.setData({
      userInfo,
      wechatUserInfo: userInfo,
      tempNickName: userInfo.nickName || ''
    })
  },

  // 微信头像选择 (使用微信官方 open-type="chooseAvatar" 方式)
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    this.setData({
      tempAvatarUrl: avatarUrl
    })
  },

  // 昵称输入 (使用微信官方 type="nickname" 方式)
  onNickNameInput(e) {
    this.setData({
      tempNickName: e.detail.value
    })
  },

  // 昵称失焦验证
  onNickNameBlur(e) {
    const nickName = e.detail.value.trim()
    if (nickName.length < 2) {
      wx.showToast({
        title: '昵称至少2个字符',
        icon: 'none'
      })
      this.setData({ tempNickName: '' })
    }
  },

  // 使用微信昵称
  useWechatName() {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || {}
    
    if (userInfo.nickName) {
      this.setData({
        tempNickName: userInfo.nickName,
        tempAvatarUrl: userInfo.avatarUrl || ''
      })
      wx.showToast({
        title: '已使用微信昵称',
        icon: 'success'
      })
    } else {
      wx.showToast({
        title: '未获取到微信昵称',
        icon: 'none'
      })
    }
  },

  // 保存
  async onSave() {
    const { tempAvatarUrl, tempNickName, userInfo } = this.data

    // 验证昵称
    if (!tempNickName.trim()) {
      wx.showToast({
        title: '昵称不能为空',
        icon: 'none'
      })
      return
    }

    if (tempNickName.trim().length < 2 || tempNickName.trim().length > 20) {
      wx.showToast({
        title: '昵称长度为2-20个字符',
        icon: 'none'
      })
      return
    }

    wx.showLoading({ title: '保存中...' })

    try {
      const openid = app.globalData.openid || wx.getStorageSync('openid')
      if (!openid) {
        wx.hideLoading()
        wx.showToast({ title: '获取用户信息失败', icon: 'none' })
        return
      }

      let cloudPath = userInfo.cloudPath || ''

      // 如果有新头像，上传到云存储
      if (tempAvatarUrl) {
        cloudPath = await app.uploadAvatar(tempAvatarUrl, openid) || cloudPath
      }

      // 更新用户信息
      const updatedUserInfo = {
        ...userInfo,
        nickName: tempNickName.trim(),
        cloudPath
      }

      // 保存到全局数据和本地存储
      app.globalData.userInfo = updatedUserInfo
      wx.setStorageSync('userInfo', updatedUserInfo)

      // 同步到云数据库
      if (openid) {
        try {
          await db.collection('users').doc(openid).set({
            data: {
              openid: openid,
              nickName: updatedUserInfo.nickName,
              cloudPath: cloudPath,
              positions: updatedUserInfo.positions || [],
              updatedAt: db.serverDate()
            },
            merge: true
          })

          // 清除用户缓存，确保其他页面看到最新数据
          if (app.clearUserCache) {
            app.clearUserCache(openid)
          }
        } catch (err) {
          console.error('[edit-profile] 云端保存失败:', err)
        }
      }

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      // 返回上一页
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)

    } catch (err) {
      wx.hideLoading()
      console.error('[edit-profile] 保存失败:', err)
      wx.showToast({
        title: '保存失败，请重试',
        icon: 'none'
      })
    }
  }
})
