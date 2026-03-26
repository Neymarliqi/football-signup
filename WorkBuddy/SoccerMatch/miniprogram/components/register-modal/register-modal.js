// components/register-modal/register-modal.js
const app = getApp()

Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    }
  },

  data: {
    tempAvatarUrl: '',
    tempNickName: '',
    privacyChecked: false,
    canSave: false,
    saving: false
  },

  observers: {
    'tempAvatarUrl, tempNickName, privacyChecked': function (avatar, nickName, checked) {
      this.setData({
        canSave: !!nickName.trim() && !!avatar && checked && !this.data.saving
      })
    },
    'saving': function (saving) {
      const { tempAvatarUrl, tempNickName, privacyChecked } = this.data
      this.setData({
        canSave: !!tempNickName.trim() && !!tempAvatarUrl && privacyChecked && !saving
      })
    }
  },

  methods: {
    preventScroll() {},

    // 关闭弹窗
    onClose() {
      this.triggerEvent('close')
    },

    onChooseAvatar(e) {
      const { avatarUrl } = e.detail
      this.setData({ tempAvatarUrl: avatarUrl })
    },

    onNickNameInput(e) {
      this.setData({ tempNickName: e.detail.value })
    },

    onNickNameBlur(e) {
      const val = e.detail.value
      if (val && val.trim()) {
        this.setData({ tempNickName: val })
      }
    },

    onNickNameChange(e) {
      const val = e.detail.value
      if (val && val.trim()) {
        this.setData({ tempNickName: val })
      }
    },

    togglePrivacy() {
      this.setData({ privacyChecked: !this.data.privacyChecked })
    },

    goPrivacy() {
      wx.navigateTo({ url: '/pages/privacy/privacy' })
    },

    async onSave() {
      const { tempAvatarUrl, tempNickName, privacyChecked, canSave, saving } = this.data

      if (saving || !canSave) return

      if (!tempNickName.trim()) {
        wx.showToast({ title: '请输入昵称', icon: 'none' })
        return
      }
      if (!tempAvatarUrl) {
        wx.showToast({ title: '请选择头像', icon: 'none' })
        return
      }
      if (!privacyChecked) {
        wx.showToast({ title: '请先阅读并勾选隐私保护', icon: 'none' })
        return
      }

      this.setData({ saving: true })

      try {
        // 1. 获取 openid
        let openid = app.globalData.openid || wx.getStorageSync('openid')
        if (!openid) {
          const res = await wx.cloud.callFunction({ name: 'getOpenid' })
          openid = res.result.openid
          app.globalData.openid = openid
          wx.setStorageSync('openid', openid)
        }

        // 2. 上传头像（统一通过 app.uploadAvatar）
        const finalAvatarUrl = await app.uploadAvatar(tempAvatarUrl)

        // 3. 创建用户记录
        await app.createUser(tempNickName.trim(), finalAvatarUrl)

        wx.showToast({ title: '欢迎加入！', icon: 'success' })

        // 4. 通知父组件注册完成
        this.triggerEvent('registered', { nickName: tempNickName.trim(), avatarUrl: finalAvatarUrl })
      } catch (e) {
        console.error('[register-modal] 注册失败', e)
        wx.showToast({ title: '注册失败，请重试', icon: 'error' })
        this.setData({ saving: false })
      }
    }
  }
})
