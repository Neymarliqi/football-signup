// pages/team/settings.js
// 球队设置
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    teamId: '',
    team: {},
    descLength: 0,
    displayCover: '',
    displayLogo: ''
  },

  onLoad(options) {
    const teamId = options.teamId
    if (!teamId) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      wx.navigateBack()
      return
    }
    this.setData({ teamId })
    this.loadTeamInfo()
  },

  async loadTeamInfo() {
    try {
      const res = await db.collection('teams').doc(this.data.teamId).get()
      if (res.data) {
        const descLength = (res.data.description || '').length
        const displayCover = res.data.coverPath ? app.getDisplayAvatar({ cloudPath: res.data.coverPath }) : ''
        const displayLogo = res.data.logoPath ? app.getDisplayAvatar({ cloudPath: res.data.logoPath }) : ''
        const team = { ...res.data, displayCover, displayLogo }
        this.setData({ team, displayCover, displayLogo, descLength })
      }
    } catch (e) {
      console.error('loadTeamInfo error', e)
    }
  },

  // ========== 图片上传 ==========
  uploadTeamImage(tempPath, folder) {
    return new Promise((resolve, reject) => {
      const openid = app.globalData.openid || wx.getStorageSync('openid')
      if (!openid) { reject(new Error('no openid')); return }
      const cloudPath = `${folder}/${openid}_${Date.now()}.jpg`
      wx.cloud.uploadFile({
        cloudPath,
        filePath: tempPath,
        success: res => resolve(res.fileID),
        fail: err => reject(err)
      })
    })
  },

  chooseCover() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'],
      sourceType: ['album', 'camera'], sizeType: ['compressed'],
      success: async (res) => {
        wx.showLoading({ title: '上传中...' })
        try {
          const cloudPath = await this.uploadTeamImage(res.tempFiles[0].tempFilePath, 'team-covers')
          const team = { ...this.data.team, coverPath: cloudPath }
          const displayCover = app.getDisplayAvatar({ cloudPath })
          this.setData({ team, displayCover })
          wx.showToast({ title: '封面上传成功', icon: 'success' })
        } catch (e) {
          wx.showToast({ title: '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  chooseLogo() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'],
      sourceType: ['album', 'camera'], sizeType: ['compressed'],
      success: async (res) => {
        wx.showLoading({ title: '上传中...' })
        try {
          const cloudPath = await this.uploadTeamImage(res.tempFiles[0].tempFilePath, 'team-logos')
          const team = { ...this.data.team, logoPath: cloudPath }
          const displayLogo = app.getDisplayAvatar({ cloudPath })
          this.setData({ team, displayLogo })
          wx.showToast({ title: 'Logo上传成功', icon: 'success' })
        } catch (e) {
          wx.showToast({ title: '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  // ========== 表单 ==========
  onInput(e) {
    const key = e.currentTarget.dataset.key
    const value = e.detail.value
    const update = { [`team.${key}`]: value }
    if (key === 'description') {
      update.descLength = (value || '').length
    }
    this.setData(update)
  },

  selectJoinMethod(e) {
    this.setData({ 'team.joinMethod': e.currentTarget.dataset.value })
  },

  // ========== 保存信息 ==========
  async saveInfo() {
    const { team } = this.data
    if (!team.name || !team.name.trim()) {
      wx.showToast({ title: '球队名称不能为空', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'updateTeam',
        data: {
          teamId: this.data.teamId,
          name: team.name.trim(),
          description: team.description || '',
          joinMethod: team.joinMethod || 'qrcode',
          coverPath: team.coverPath || '',
          logoPath: team.logoPath || ''
        }
      })
      wx.hideLoading()
      if (res.result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' })
      } else {
        wx.showToast({ title: res.result.message || '保存失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  // ========== 分享邀请 ==========
  shareTeam() {
    const { teamId, team } = this.data
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
    this.setData({ shareReady: true })
  },

  onShareAppMessage() {
    const { teamId, team } = this.data
    return {
      title: `加入「${team.name}」，一起踢球！`,
      path: `/pages/team/home?teamId=${teamId}`,
      imageUrl: team.logoPath ? app.getDisplayAvatar({ cloudPath: team.logoPath }) : ''
    }
  },

  // ========== 解散球队 ==========
  async deleteTeam() {
    const { team, teamId } = this.data
    wx.showModal({
      title: '确认解散',
      content: `确定解散「${team.name}」？此操作不可恢复！`,
      confirmText: '确认解散',
      confirmColor: '#e74c3c',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '解散中...' })
        try {
          const result = await wx.cloud.callFunction({
            name: 'deleteTeam',
            data: { teamId }
          })
          wx.hideLoading()
          if (result.result.success) {
            wx.showToast({ title: '球队已解散', icon: 'success' })
            setTimeout(() => {
              wx.switchTab({ url: '/pages/profile/profile' })
            }, 1500)
          } else {
            wx.showToast({ title: result.result.message, icon: 'none' })
          }
        } catch (e) {
          wx.hideLoading()
          wx.showToast({ title: '解散失败', icon: 'none' })
        }
      }
    })
  }
})
