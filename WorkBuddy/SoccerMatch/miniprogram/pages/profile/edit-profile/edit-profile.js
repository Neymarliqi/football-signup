// pages/profile/edit-profile/edit-profile.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    userInfo: {},
    tempAvatarUrl: '',
    tempNickName: '',
    placeholderAvatar: '/images/default-avatar.png'
  },

  onLoad() {
    this.loadUserInfo()
  },

  loadUserInfo() {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || {}
    this.setData({
      userInfo,
      tempNickName: userInfo.nickName || ''
    })
  },

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    this.setData({
      tempAvatarUrl: avatarUrl
    })
  },

  onNickNameInput(e) {
    this.setData({
      tempNickName: e.detail.value
    })
  },

  async onSave(e) {
    const { tempAvatarUrl, tempNickName, userInfo } = this.data

    // 从表单获取昵称
    const formNickName = e.detail.value.nickName
    const finalNickName = formNickName || tempNickName

    if (!finalNickName || !finalNickName.trim()) {
      wx.showToast({
        title: '昵称不能为空',
        icon: 'none'
      })
      return
    }

    wx.showLoading({ title: '保存中...' })

    try {
      // 1. 先获取 openid
      const openid = app.globalData.openid || wx.getStorageSync('openid')
      if (!openid || openid === 'undefined' || openid === '') {
        wx.hideLoading()
        wx.showToast({ title: '用户信息异常，请重试', icon: 'none' })
        return
      }

      let cloudPath = userInfo.cloudPath || ''

      // 2. 如果上传了新头像，上传到云存储
      if (tempAvatarUrl && !tempAvatarUrl.startsWith('cloud://') && !tempAvatarUrl.startsWith('data:image')) {
        try {
          cloudPath = await app.uploadAvatar(tempAvatarUrl, openid)
        } catch (e) {
          console.error('[edit-profile] 头像上传失败:', e)
        }
      }

      // 3. 构建更新后的用户信息（存 cloudPath，兼容字段保留）
      const updatedUserInfo = {
        ...userInfo,
        nickName: finalNickName.trim(),
        cloudPath,
        openid
      }

      // 4. 更新本地缓存（优先）
      app.globalData.userInfo = updatedUserInfo
      wx.setStorageSync('userInfo', updatedUserInfo)

      // 5. 同步保存到云端（等待写入完成再返回，确保其他页面能查到新头像）
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
      } catch (err) {
        console.error('[edit-profile] 云端保存失败:', err)
      }

      // 6. 清除自己的缓存（内存 + Storage 双清）
      if (app.clearUserCache) {
        app.clearUserCache(openid)
      }

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

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
