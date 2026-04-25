// pages/team/picker.js
// 球队选择器（仿地址管理交互）
const app = getApp()
const CACHE_KEY = 'picker_myTeams'
const DEFAULT_TEAM_KEY = 'default_team_id'
const LAST_SELECTED_KEY = 'picker_last_selected'

Page({
  data: {
    myTeams: [],
    // 当前选中（用于本次活动）
    selectedTeamId: '',
    // 默认球队（下次创建活动自动选）
    defaultTeamId: '',
    managing: false,
    loaded: false
  },

  onLoad(options) {
    let currentTeamId = options.currentTeamId || ''
    if (currentTeamId === 'undefined') currentTeamId = ''
    // hasChosen=1 表示用户已主动做过选择（包括选了公开活动），此时即使为空也要保持空（选中公开活动）
    const hasChosen = options.hasChosen === '1'

    let selectedId = currentTeamId
    if (!selectedId && !hasChosen) {
      // 没传值且用户没选过 → 用默认球队
      selectedId = wx.getStorageSync(DEFAULT_TEAM_KEY) || ''
    } else if (!selectedId && hasChosen) {
      // 用户主动选了公开活动 → 保持空
      selectedId = ''
    }

    if (selectedId === undefined || selectedId === null) {
      selectedId = ''
    }

    const defaultTeamId = wx.getStorageSync(DEFAULT_TEAM_KEY) || ''
    this.setData({ selectedTeamId: selectedId, defaultTeamId })
    this.loadMyTeams()
  },

  onShow() {
    if (this.data.loaded) {
      // 只刷新默认球队标记和列表，不再用 LAST_SELECTED_KEY 覆盖选中状态
      // 选中状态由 onLoad 根据 currentTeamId 正确设置，onShow 覆盖会导致勾选错位
      const defaultTeamId = wx.getStorageSync(DEFAULT_TEAM_KEY) || ''
      this.setData({ defaultTeamId })
      this.loadMyTeams()
    }
  },

  // ========== 加载球队列表（stale-while-revalidate 策略）==========

  loadMyTeams() {
    // 第一步：先读本地缓存秒渲染，消除白屏闪烁
    const cached = wx.getStorageSync(CACHE_KEY)
    if (cached && cached.data && cached.data.length > 0) {
      this._renderTeams(cached.data)
    }

    // 第二步：后台请求最新数据，返回后静默刷新
    this._fetchFromCloud()
  },

  _fetchFromCloud() {
    wx.cloud.callFunction({ name: 'getMyTeams' }).then(res => {
      if (res.result.success) {
        const allTeams = [...res.result.createdTeams, ...res.result.joinedTeams]
        // 更新本地缓存
        wx.setStorageSync(CACHE_KEY, { data: allTeams, cachedAt: Date.now() })
        // 渲染最新数据（覆盖可能的旧缓存）
        this._renderTeams(allTeams)
      } else {
        this.setData({ loaded: true })
      }
    }).catch(e => {
      console.error('loadMyTeams error', e)
      this.setData({ loaded: true })
    })
  },

  // 统一渲染球队列表（缓存和云端共用）
  _renderTeams(allTeams) {
    const roleTextMap = { creator: '创建者', admin: '管理员', member: '成员' }
    const myTeams = allTeams.map(t => ({
      ...t,
      myRoleText: roleTextMap[t.myRole] || t.myRole,
      displayLogo: t.logoPath ? app.getDisplayAvatar({ cloudPath: t.logoPath }) : ''
    }))
    this.setData({ myTeams, loaded: true })
  },

  // ========== 浏览模式：选择球队 ==========

  selectTeam(e) {
    // 微信小程序 data 属性空字符串会被转成 undefined，需要兜底处理
    let teamId = e.currentTarget.dataset.teamid
    if (teamId === undefined) {
      teamId = ''
    }
    this.setData({ selectedTeamId: teamId })
    // 记住选择
    wx.setStorageSync(LAST_SELECTED_KEY, teamId)

    const team = teamId ? this.data.myTeams.find(t => t._id === teamId) : null

    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2]
    if (prevPage && prevPage.selectTeam) {
      prevPage.selectTeam(teamId, team ? team.name : '')
    }

    wx.navigateBack()
  },

  // ========== 管理模式切换 ==========

  toggleManage() {
    this.setData({ managing: !this.data.managing })
  },

  // ========== 设为默认（管理模式下的 radio）==========

  setDefaultTeam(e) {
    // 微信小程序 data 属性空字符串会被转成 undefined，需要兜底处理
    let teamId = e.currentTarget.dataset.teamid
    if (teamId === undefined) {
      teamId = ''
    }
    wx.setStorageSync(DEFAULT_TEAM_KEY, teamId)
    this.setData({ defaultTeamId: teamId })
    wx.showToast({ title: '已设为默认', icon: 'success' })
  },

  // ========== 编辑球队 ==========

  editTeam(e) {
    // 兜底处理微信小程序 dataset 空值问题
    const teamId = e.currentTarget.dataset.teamid || ''
    if (!teamId) return
    wx.navigateTo({
      url: `/pages/team/settings?teamId=${teamId}`
    })
  },

  // ========== 删除球队 ==========

  deleteTeam(e) {
    // 兜底处理微信小程序 dataset 空值问题
    const teamId = e.currentTarget.dataset.teamid || ''
    if (!teamId) return
    const team = this.data.myTeams.find(t => t._id === teamId)
    if (!team) return

    wx.showModal({
      title: '删除球队',
      content: `确定要删除「${team.name}」吗？删除后无法恢复。`,
      confirmColor: '#e74c3c',
      confirmText: '删除',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中...' })
        try {
          await wx.cloud.callFunction({
            name: 'deleteTeam',
            data: { teamId }
          })
          wx.hideLoading()
          wx.showToast({ title: '已删除', icon: 'success' })
          // 清理关联缓存
          if (this.data.defaultTeamId === teamId) {
            wx.removeStorageSync(DEFAULT_TEAM_KEY)
            this.setData({ defaultTeamId: '' })
          }
          if (this.data.selectedTeamId === teamId) {
            wx.removeStorageSync(LAST_SELECTED_KEY)
            this.setData({ selectedTeamId: '' })
          }
          setTimeout(() => this.loadMyTeams(), 500)
        } catch (err) {
          wx.hideLoading()
          console.error('deleteTeam error', err)
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  },

  createTeam() {
    wx.navigateTo({ url: '/pages/team/create' })
  },

  preventBubble() {}
})
