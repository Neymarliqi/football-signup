// pages/team/picker.js
// 球队选择器
const app = getApp()

Page({
  data: {
    myTeams: [],
    selectedTeamId: '',
    loaded: false
  },

  onLoad(options) {
    // 接收当前已选球队ID（从创建活动页传入）
    const currentTeamId = options.currentTeamId || ''
    this.setData({ selectedTeamId: currentTeamId })
    this.loadMyTeams()
  },

  async loadMyTeams() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getMyTeams'
      })

      if (res.result.success) {
        const allTeams = [...res.result.createdTeams, ...res.result.joinedTeams]
        const roleTextMap = {
          creator: '创建者',
          admin: '管理员',
          member: '成员'
        }

        const myTeams = allTeams.map(t => ({
          ...t,
          myRoleText: roleTextMap[t.myRole] || t.myRole,
          displayLogo: t.logoPath ? app.getDisplayAvatar({ cloudPath: t.logoPath }) : ''
        }))

        this.setData({ myTeams, loaded: true })
      } else {
        this.setData({ loaded: true })
      }
    } catch (e) {
      console.error('loadMyTeams error', e)
      this.setData({ loaded: true })
    }
  },

  selectTeam(e) {
    const teamId = e.currentTarget.dataset.teamid
    const { myTeams } = this.data
    const team = teamId ? myTeams.find(t => t._id === teamId) : null

    // 通过 eventChannel 通知上一页
    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2]
    if (prevPage && prevPage.selectTeam) {
      prevPage.selectTeam(teamId, team ? team.name : '')
    }

    wx.navigateBack()
  },

  createTeam() {
    wx.navigateTo({
      url: '/pages/team/create'
    })
  }
})
