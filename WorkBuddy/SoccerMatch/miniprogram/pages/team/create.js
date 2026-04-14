// pages/team/create.js
// 创建球队
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    form: {
      name: '',
      description: '',
      logoPath: '',
      coverPath: '',
      joinMethod: 'qrcode'
    },
    showRegisterModal: false,
    displayCover: '',
    displayLogo: '',
    submitting: false
  },

  onLoad() {
    // 注册检查
    app.onUserRegistered(() => {})
  },

  onShow() {
    // 注册弹窗状态同步
    if (!app.isUserRegistered()) {
      this.setData({ showRegisterModal: true })
    }
  },

  onRegistered() {
    this.setData({ showRegisterModal: false })
  },

  onCloseRegister() {
    this.setData({ showRegisterModal: false })
    wx.navigateBack()
  },

  // ========== 图片上传 ==========

  // 选择封面
  chooseCover() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: async (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        wx.showLoading({ title: '上传中...' })
        try {
          const cloudPath = await this.uploadTeamImage(tempPath, 'covers')
          this.setData({ 'form.coverPath': cloudPath, displayCover: app.getDisplayAvatar({ cloudPath }) })
          wx.showToast({ title: '封面上传成功', icon: 'success' })
        } catch (e) {
          wx.showToast({ title: '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  // 选择Logo
  chooseLogo() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: async (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        wx.showLoading({ title: '上传中...' })
        try {
          const cloudPath = await this.uploadTeamImage(tempPath, 'team-logos')
          this.setData({ 'form.logoPath': cloudPath, displayLogo: app.getDisplayAvatar({ cloudPath }) })
          wx.showToast({ title: 'Logo上传成功', icon: 'success' })
        } catch (e) {
          wx.showToast({ title: '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  // 上传球队图片到云存储
  uploadTeamImage(tempPath, folder) {
    return new Promise((resolve, reject) => {
      const openid = app.globalData.openid || wx.getStorageSync('openid')
      if (!openid) {
        reject(new Error('未获取到用户身份'))
        return
      }
      const cloudPath = `${folder}/${openid}_${Date.now()}.jpg`
      wx.cloud.uploadFile({
        cloudPath,
        filePath: tempPath,
        success: res => resolve(res.fileID),
        fail: err => reject(err)
      })
    })
  },

  // ========== 表单 ==========

  onInput(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ [`form.${key}`]: e.detail.value })
  },

  selectJoinMethod(e) {
    this.setData({ 'form.joinMethod': e.currentTarget.dataset.value })
  },

  // ========== 提交 ==========

  async submit() {
    if (!app.isUserRegistered()) {
      this.setData({ showRegisterModal: true })
      return
    }

    const { form } = this.data
    if (!form.name.trim()) {
      wx.showToast({ title: '请填写球队名称', icon: 'none' })
      return
    }

    if (form.name.trim().length > 20) {
      wx.showToast({ title: '球队名称不能超过20字', icon: 'none' })
      return
    }

    if (form.description && form.description.length > 200) {
      wx.showToast({ title: '简介不能超过200字', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '创建中...' })

    try {
      const res = await wx.cloud.callFunction({
        name: 'createTeam',
        data: {
          name: form.name,
          logoPath: form.logoPath || '',
          coverPath: form.coverPath || '',
          description: form.description || '',
          joinMethod: form.joinMethod
        }
      })

      wx.hideLoading()

      if (res.result.success) {
        wx.showToast({ title: '创建成功', icon: 'success' })
        setTimeout(() => {
          wx.redirectTo({
            url: `/pages/team/home?teamId=${res.result.teamId}`
          })
        }, 1500)
      } else {
        wx.showToast({ title: res.result.message || '创建失败', icon: 'none' })
        this.setData({ submitting: false })
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '创建失败，请重试', icon: 'none' })
      this.setData({ submitting: false })
    }
  }
})
