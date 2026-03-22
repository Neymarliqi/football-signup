// 云函数：生成全面的测试数据（覆盖所有状态和边界条件）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { myOpenid } = event
  
  if (!myOpenid) {
    return { success: false, message: '需要提供 myOpenid 参数' }
  }

  // 模拟其他用户的 OpenID
  const otherOpenids = [
    'o1234567890abcdef1', 'o1234567890abcdef2', 'o1234567890abcdef3',
    'o1234567890abcdef4', 'o1234567890abcdef5', 'o1234567890abcdef6',
    'o1234567890abcdef7', 'o1234567890abcdef8', 'o1234567890abcdef9'
  ]
  
  const avatarUrl = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'
  const now = new Date()
  
  // 时间辅助函数
  const addDays = (d) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000)
  const addHours = (h) => new Date(now.getTime() + h * 60 * 60 * 1000)
  const subDays = (d) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000)

  // 创建用户的辅助函数
  const createUser = (openid, nickName, positions = []) => ({
    openid, nickName, avatarUrl, status: 'confirmed', positions
  })
  
  const createPendingUser = (openid, nickName) => ({
    openid, nickName, avatarUrl, status: 'pending'
  })
  
  const createLeaveUser = (openid, nickName) => ({
    openid, nickName, avatarUrl, status: 'leave'
  })

  const testData = [
    // ============================================
    // ========== 状态测试：open（报名中）==========
    // ============================================
    
    // 1. 我发布的 + 空报名（0人）
    {
      title: '【状态测试】报名中-空活动',
      locationName: '测试场地',
      location: '北京市测试区测试路1号',
      activityDate: addDays(2),
      time: '14:00 - 16:00',
      matchType: '5人制',
      maxPlayers: 10,
      fee: 30,
      createdBy: myOpenid,
      creatorName: '我',
      status: 'open',
      registrations: [],
      createdAt: subDays(1)
    },
    
    // 2. 我发布的 + 只有我报名
    {
      title: '【状态测试】报名中-只有我',
      locationName: '朝阳公园',
      location: '北京市朝阳区朝阳公园南路',
      activityDate: addDays(3),
      time: '19:00 - 21:00',
      matchType: '7人制',
      maxPlayers: 14,
      fee: 50,
      createdBy: myOpenid,
      creatorName: '我',
      status: 'open',
      registrations: [createUser(myOpenid, '我', [{value:'CM',order:1,label:'首'}])],
      createdAt: subDays(2)
    },
    
    // 3. 我发布的 + 已满员
    {
      title: '【状态测试】报名中-已满员',
      locationName: '奥体中心',
      location: '北京市朝阳区安定路1号',
      activityDate: addDays(1),
      time: '10:00 - 12:00',
      matchType: '5人制',
      maxPlayers: 6,
      fee: 40,
      createdBy: myOpenid,
      creatorName: '我',
      status: 'open',
      registrations: [
        createUser(myOpenid, '我', [{value:'ST',order:1,label:'首'}]),
        createUser(otherOpenids[0], '张三', [{value:'GK',order:1,label:'首'}]),
        createUser(otherOpenids[1], '李四', [{value:'CB',order:1,label:'首'}]),
        createUser(otherOpenids[2], '王五', [{value:'CM',order:1,label:'首'}]),
        createUser(otherOpenids[3], '赵六', [{value:'LW',order:1,label:'首'}]),
        createUser(otherOpenids[4], '孙七', [{value:'RW',order:1,label:'首'}])
      ],
      createdAt: subDays(3)
    },
    
    // 4. 我发布的 + 有 confirmed + pending + leave 混合
    {
      title: '【状态测试】报名中-混合状态',
      locationName: '工人体育场',
      location: '北京市朝阳区工体北路',
      activityDate: addDays(2),
      time: '15:00 - 17:00',
      matchType: '7人制',
      maxPlayers: 14,
      fee: 60,
      createdBy: myOpenid,
      creatorName: '我',
      status: 'open',
      registrations: [
        createUser(myOpenid, '我', [{value:'ST',order:1,label:'首'}]),
        createUser(otherOpenids[0], '张三', [{value:'GK',order:1,label:'首'}]),
        createUser(otherOpenids[1], '李四', [{value:'CB',order:1,label:'首'}]),
        createUser(otherOpenids[2], '王五', [{value:'CM',order:1,label:'首'}]),
        createPendingUser(otherOpenids[3], '赵六待定'),
        createPendingUser(otherOpenids[4], '孙七待定'),
        createLeaveUser(otherOpenids[5], '周八请假'),
        createLeaveUser(otherOpenids[6], '吴九请假')
      ],
      createdAt: subDays(1)
    },
    
    // 5. 我发布的 + 免费活动
    {
      title: '【边界测试】免费活动',
      locationName: '社区球场',
      location: '北京市海淀区社区路',
      activityDate: addDays(5),
      time: '09:00 - 11:00',
      matchType: '友谊赛',
      maxPlayers: 10,
      fee: 0,
      createdBy: myOpenid,
      creatorName: '我',
      status: 'open',
      registrations: [
        createUser(myOpenid, '我'),
        createUser(otherOpenids[0], '张三'),
        createUser(otherOpenids[1], '李四')
      ],
      createdAt: subDays(2)
    },
    
    // 6. 我发布的 + 高价活动
    {
      title: '【边界测试】高价活动100元',
      locationName: '高端球场',
      location: '北京市朝阳区高端路88号',
      activityDate: addDays(4),
      time: '20:00 - 22:00',
      matchType: '11人制',
      maxPlayers: 22,
      fee: 100,
      createdBy: myOpenid,
      creatorName: '我',
      status: 'open',
      registrations: [
        createUser(myOpenid, '我'),
        createUser(otherOpenids[0], '张三'),
        createUser(otherOpenids[1], '李四'),
        createUser(otherOpenids[2], '王五')
      ],
      createdAt: subDays(1)
    },

    // ============================================
    // ========== 状态测试：ongoing（进行中）========
    // ============================================
    
    // 7. 我发布的 + 进行中（今天正在进行）
    {
      title: '【状态测试】进行中-今天',
      locationName: '实时球场',
      location: '北京市测试区实时路',
      activityDate: now,
      time: '14:00 - 17:00',
      matchType: '5人制',
      maxPlayers: 10,
      fee: 35,
      createdBy: myOpenid,
      creatorName: '我',
      status: 'ongoing',
      registrations: [
        createUser(myOpenid, '我', [{value:'ST',order:1,label:'首'}]),
        createUser(otherOpenids[0], '张三', [{value:'GK',order:1,label:'首'}]),
        createUser(otherOpenids[1], '李四', [{value:'CB',order:1,label:'首'}]),
        createUser(otherOpenids[2], '王五', [{value:'CM',order:1,label:'首'}]),
        createUser(otherOpenids[3], '赵六', [{value:'LW',order:1,label:'首'}])
      ],
      createdAt: subDays(5)
    },

    // ============================================
    // ========== 状态测试：finished（已结束）========
    // ============================================
    
    // 8. 我发布的 + 已结束
    {
      title: '【状态测试】已结束-我发布',
      locationName: '历史球场A',
      location: '北京市历史区历史路1号',
      activityDate: subDays(2),
      time: '14:00 - 16:00',
      matchType: '5人制',
      maxPlayers: 10,
      fee: 30,
      createdBy: myOpenid,
      creatorName: '我',
      status: 'finished',
      registrations: [
        createUser(myOpenid, '我'),
        createUser(otherOpenids[0], '张三'),
        createUser(otherOpenids[1], '李四'),
        createUser(otherOpenids[2], '王五')
      ],
      createdAt: subDays(10)
    },
    
    // 9. 我报名的 + 已结束
    {
      title: '【状态测试】已结束-我参与',
      locationName: '历史球场B',
      location: '北京市历史区历史路2号',
      activityDate: subDays(3),
      time: '19:00 - 21:00',
      matchType: '7人制',
      maxPlayers: 14,
      fee: 50,
      createdBy: otherOpenids[0],
      creatorName: '张三',
      status: 'finished',
      registrations: [
        createUser(otherOpenids[0], '张三'),
        createUser(myOpenid, '我'),
        createUser(otherOpenids[1], '李四'),
        createUser(otherOpenids[2], '王五')
      ],
      createdAt: subDays(8)
    },

    // ============================================
    // ========== 状态测试：cancelled（已取消）========
    // ============================================
    
    // 10. 我发布的 + 已取消
    {
      title: '【状态测试】已取消-我发布',
      locationName: '取消球场',
      location: '北京市取消区取消路',
      activityDate: addDays(5),
      time: '10:00 - 12:00',
      matchType: '5人制',
      maxPlayers: 10,
      fee: 30,
      createdBy: myOpenid,
      creatorName: '我',
      status: 'cancelled',
      registrations: [
        createUser(myOpenid, '我'),
        createUser(otherOpenids[0], '张三'),
        createUser(otherOpenids[1], '李四')
      ],
      createdAt: subDays(5),
      cancelReason: '天气原因取消'
    },
    
    // 11. 我报名的 + 已取消
    {
      title: '【状态测试】已取消-我报名',
      locationName: '取消球场B',
      location: '北京市取消区取消路2号',
      activityDate: addDays(7),
      time: '15:00 - 17:00',
      matchType: '7人制',
      maxPlayers: 14,
      fee: 45,
      createdBy: otherOpenids[1],
      creatorName: '李四',
      status: 'cancelled',
      registrations: [
        createUser(otherOpenids[1], '李四'),
        createUser(myOpenid, '我'),
        createUser(otherOpenids[0], '张三')
      ],
      createdAt: subDays(4),
      cancelReason: '人数不足取消'
    },

    // ============================================
    // ========== 我报名的活动（各种状态）==========
    // ============================================
    
    // 12. 我报名 + confirmed状态
    {
      title: '【我报名】已确认参与',
      locationName: '参与球场A',
      location: '北京市参与区参与路1号',
      activityDate: addDays(2),
      time: '14:00 - 16:00',
      matchType: '5人制',
      maxPlayers: 10,
      fee: 35,
      createdBy: otherOpenids[2],
      creatorName: '王五',
      status: 'open',
      registrations: [
        createUser(otherOpenids[2], '王五'),
        createUser(myOpenid, '我', [{value:'ST',order:1,label:'首'}]),
        createUser(otherOpenids[0], '张三'),
        createUser(otherOpenids[1], '李四')
      ],
      createdAt: subDays(2)
    },
    
    // 13. 我报名 + pending状态
    {
      title: '【我报名】待定状态',
      locationName: '参与球场B',
      location: '北京市参与区参与路2号',
      activityDate: addDays(3),
      time: '19:00 - 21:00',
      matchType: '7人制',
      maxPlayers: 14,
      fee: 55,
      createdBy: otherOpenids[3],
      creatorName: '赵六',
      status: 'open',
      registrations: [
        createUser(otherOpenids[3], '赵六'),
        createPendingUser(myOpenid, '我待定'),
        createUser(otherOpenids[0], '张三'),
        createUser(otherOpenids[1], '李四')
      ],
      createdAt: subDays(1)
    },
    
    // 14. 我报名 + leave状态
    {
      title: '【我报名】请假状态',
      locationName: '参与球场C',
      location: '北京市参与区参与路3号',
      activityDate: addDays(4),
      time: '10:00 - 12:00',
      matchType: '5人制',
      maxPlayers: 10,
      fee: 30,
      createdBy: otherOpenids[4],
      creatorName: '孙七',
      status: 'open',
      registrations: [
        createUser(otherOpenids[4], '孙七'),
        createLeaveUser(myOpenid, '我请假'),
        createUser(otherOpenids[0], '张三'),
        createUser(otherOpenids[1], '李四')
      ],
      createdAt: subDays(2)
    },

    // ============================================
    // ========== 边界条件测试 ==========
    // ============================================
    
    // 15. 超长标题测试（50字左右）
    {
      title: '【边界测试】这是一个测试超长标题的活动名称看看显示效果如何截断',
      locationName: '测试场地',
      location: '北京市测试区测试路',
      activityDate: addDays(6),
      time: '15:00 - 17:00',
      matchType: '5人制',
      maxPlayers: 10,
      fee: 30,
      createdBy: myOpenid,
      creatorName: '我',
      status: 'open',
      registrations: [
        createUser(myOpenid, '我'),
        createUser(otherOpenids[0], '张三')
      ],
      createdAt: subDays(1)
    },
    
    // 16. 超长地点名称测试
    {
      title: '【边界测试】长地点名称',
      locationName: '北京市朝阳区三里屯街道工人体育场北路甲2号盈科中心',
      location: '北京市朝阳区三里屯街道工人体育场北路甲2号盈科中心写字楼A座旁边的足球场',
      activityDate: addDays(7),
      time: '16:00 - 18:00',
      matchType: '7人制',
      maxPlayers: 14,
      fee: 60,
      createdBy: otherOpenids[1],
      creatorName: '李四',
      status: 'open',
      registrations: [
        createUser(otherOpenids[1], '李四'),
        createUser(otherOpenids[2], '王五'),
        createUser(otherOpenids[3], '赵六')
      ],
      createdAt: subDays(2)
    },
    
    // 17. 1人制最小活动
    {
      title: '【边界测试】1人制活动',
      locationName: '单人训练场',
      location: '北京市训练区训练路',
      activityDate: addDays(1),
      time: '10:00 - 11:00',
      matchType: '1人训练',
      maxPlayers: 1,
      fee: 20,
      createdBy: myOpenid,
      creatorName: '我',
      status: 'open',
      registrations: [createUser(myOpenid, '我')],
      createdAt: subDays(1)
    },
    
    // 18. 其他人的活动（我没参与）- 游客视角测试
    {
      title: '【游客测试】其他人活动-我没参与',
      locationName: '陌生球场',
      location: '北京市陌生区陌生路',
      activityDate: addDays(2),
      time: '14:00 - 16:00',
      matchType: '5人制',
      maxPlayers: 10,
      fee: 40,
      createdBy: otherOpenids[5],
      creatorName: '周八',
      status: 'open',
      registrations: [
        createUser(otherOpenids[5], '周八'),
        createUser(otherOpenids[6], '吴九'),
        createUser(otherOpenids[7], '郑十')
      ],
      createdAt: subDays(1)
    },
    
    // 19. 多人报名测试（14人）
    {
      title: '【边界测试】多人报名14人',
      locationName: '大球场',
      location: '北京市大区大路',
      activityDate: addDays(3),
      time: '19:00 - 21:00',
      matchType: '7人制',
      maxPlayers: 14,
      fee: 50,
      createdBy: otherOpenids[0],
      creatorName: '张三',
      status: 'open',
      registrations: [
        createUser(otherOpenids[0], '张三'),
        createUser(otherOpenids[1], '李四'),
        createUser(otherOpenids[2], '王五'),
        createUser(otherOpenids[3], '赵六'),
        createUser(otherOpenids[4], '孙七'),
        createUser(otherOpenids[5], '周八'),
        createUser(otherOpenids[6], '吴九'),
        createUser(otherOpenids[7], '郑十'),
        createUser(otherOpenids[8], '钱十一'),
        createUser('user1', '用户1'),
        createUser('user2', '用户2'),
        createUser('user3', '用户3'),
        createUser('user4', '用户4'),
        createUser(myOpenid, '我')
      ],
      createdAt: subDays(2)
    },
    
    // 20. 自定义赛制测试
    {
      title: '【功能测试】自定义赛制',
      locationName: '定制球场',
      location: '北京市定制区定制路',
      activityDate: addDays(5),
      time: '15:00 - 17:00',
      matchType: '公司内部赛',
      maxPlayers: 12,
      fee: 0,
      createdBy: myOpenid,
      creatorName: '我',
      status: 'open',
      registrations: [
        createUser(myOpenid, '我'),
        createUser(otherOpenids[0], '张三'),
        createUser(otherOpenids[1], '李四')
      ],
      createdAt: subDays(1),
      customMatchTypes: ['公司内部赛', '部门对抗赛', '新人欢迎赛']
    }
  ]

  try {
    // 插入测试数据
    const result = await db.collection('activities').add({
      data: testData
    })
    
    return {
      success: true,
      message: `成功插入 ${testData.length} 条测试数据`,
      data: {
        total: testData.length,
        byStatus: {
          open: testData.filter(t => t.status === 'open').length,
          ongoing: testData.filter(t => t.status === 'ongoing').length,
          finished: testData.filter(t => t.status === 'finished').length,
          cancelled: testData.filter(t => t.status === 'cancelled').length
        },
        byCreator: {
          myPublished: testData.filter(t => t.createdBy === myOpenid).length,
          myRegistered: testData.filter(t => 
            t.createdBy !== myOpenid && 
            t.registrations.some(r => r.openid === myOpenid)
          ).length,
          others: testData.filter(t => 
            t.createdBy !== myOpenid && 
            !t.registrations.some(r => r.openid === myOpenid)
          ).length
        }
      }
    }
  } catch (err) {
    return {
      success: false,
      message: '插入失败',
      error: err.message
    }
  }
}
