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
      // 1. 先获取 openid
      const openid = app.globalData.openid || wx.getStorageSync('openid')
      if (!openid || openid === 'undefined' || openid === '') {
        wx.hideLoading()
        wx.showToast({ title: '用户信息异常，请重试', icon: 'none' })
        return
      }

      let finalAvatarUrl = userInfo.avatarUrl

      // 2. 如果上传了新头像，先上传到云存储
      if (tempAvatarUrl) {
        const ext = tempAvatarUrl.match(/\.([^.]+)$/) ? tempAvatarUrl.match(/\.([^.]+)$/)[1] : 'jpg'
        const cloudPath = `avatars/${openid}_${Date.now()}.${ext}`

        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: tempAvatarUrl
        })

        finalAvatarUrl = uploadRes.fileID
      }

      // 3. 构建更新后的用户信息
      const updatedUserInfo = {
        ...userInfo,
        nickName: finalNickName.trim(),
        avatarUrl: finalAvatarUrl,
        openid  // 确保 openid 存在
      }

      // 4. 更新本地缓存（优先）
      app.globalData.userInfo = updatedUserInfo
      wx.setStorageSync('userInfo', updatedUserInfo)

      // 5. 异步保存到云端（不影响本地体验）
      db.collection('users').doc(openid).update({
        data: {
          nickName: updatedUserInfo.nickName,
          avatarUrl: updatedUserInfo.avatarUrl,
          openid: openid,
          updatedAt: db.serverDate()
        }
      }).catch(err => {
        console.error('[edit-profile] 云端保存失败:', err)
        // 云端保存失败不影响用户体验，本地已保存
      })

      // 6. 主动清除自己的缓存（强制其他页面重新查询）
      if (app.clearUserCache) {
        app.clearUserCache(openid)
        console.log('[edit-profile] 已清除用户缓存:', openid)
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
