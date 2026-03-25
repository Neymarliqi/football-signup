// pages/profile/edit-profile/edit-profile.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    userInfo: {},
    tempAvatarUrl: '',
    tempNickName: '',
    placeholderAvatar: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'
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
      let finalAvatarUrl = userInfo.avatarUrl

      if (tempAvatarUrl) {
        const openid = app.globalData.openid || wx.getStorageSync('openid')
        if (!openid) {
          wx.hideLoading()
          wx.showToast({ title: '获取用户信息失败', icon: 'none' })
          return
        }
        const ext = tempAvatarUrl.match(/\.([^.]+)$/) ? tempAvatarUrl.match(/\.([^.]+)$/)[1] : 'jpg'
        const cloudPath = `avatars/${openid}_${Date.now()}.${ext}`

        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: tempAvatarUrl
        })

        finalAvatarUrl = uploadRes.fileID
      }

      const updatedUserInfo = {
        ...userInfo,
        nickName: finalNickName.trim(),
        avatarUrl: finalAvatarUrl
      }

      app.globalData.userInfo = updatedUserInfo
      wx.setStorageSync('userInfo', updatedUserInfo)

      const openid = app.globalData.openid || wx.getStorageSync('openid')
      if (openid) {
        await db.collection('users').doc(openid).update({
          data: {
            nickName: updatedUserInfo.nickName,
            avatarUrl: updatedUserInfo.avatarUrl,
            updatedAt: db.serverDate()
          }
        })
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
