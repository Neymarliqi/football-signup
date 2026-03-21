// 云函数：生成测试数据
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { myOpenid } = event
  
  if (!myOpenid) {
    return { success: false, message: '需要提供 myOpenid 参数' }
  }

  // 其他用户的 OpenID（模拟其他用户）
  const otherOpenids = [
    'o1234567890abcdef1',
    'o1234567890abcdef2',
    'o1234567890abcdef3',
    'o1234567890abcdef4'
  ]

  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const testData = [
    // ========== 我发布的活动（4个）==========
    {
      title: '周末养生足球局，欢迎新手加入',
      locationName: '朝阳公园足球场',
      location: '北京市朝阳区朝阳公园南路1号',
      activityDate: tomorrow,
      time: '14:00 - 16:00',
      matchType: '5人制',
      maxPlayers: 10,
      fee: 30,
      createdBy: myOpenid,
      creatorName: '我',
      status: 'open',
      registrations: [
        { openid: myOpenid, nickName: '我', avatarUrl: '', status: 'confirmed' },
        { openid: otherOpenids[0], nickName: '张三', avatarUrl: '', status: 'confirmed' },
        { openid: otherOpenids[1], nickName: '李四', avatarUrl: '', status: 'confirmed' },
        { openid: otherOpenids[2], nickName: '王五', avatarUrl: '', status: 'pending' }
      ],
      createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
    },
    {
      title: '周三晚场，高手来战',
      locationName: '奥体中心足球场A区',
      location: '北京市朝阳区安定路1号',
      activityDate: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
      time: '19:00 - 21:00',
      matchType: '7人制',
      maxPlayers: 14,
      fee: 50,
      createdBy: myOpenid,
      creatorName: '我',
      status: 'open',
      registrations: [
        { openid: myOpenid, nickName: '我', avatarUrl: '', status: 'confirmed' },
        { openid: otherOpenids[0], nickName: '张三', avatarUrl: '', status: 'confirmed' },
        { openid: otherOpenids[1], nickName: '李四', avatarUrl: '', status: 'confirmed' },
        { openid: otherOpenids[2], nickName: '王五', avatarUrl: '', status: 'confirmed' },
        { openid: otherOpenids[3], nickName: '赵六', avatarUrl: '', status: 'confirmed' }
      ],
      createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)
    },
    {
      title: '已取消的测试活动',
      locationName: '测试场地',
      location: '测试地址',
      activityDate: nextWeek,
      time: '10:00 - 12:00',
      matchType: '5人制',
      maxPlayers: 10,
      fee: 0,
      createdBy: myOpenid,
      creatorName: '我',
      status: 'cancelled',
      registrations: [
        { openid: otherOpenids[0], nickName: '张三', avatarUrl: '', status: 'confirmed' }
      ],
      createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
    },
    {
      title: '这个标题非常非常长长长长长长长长长长长长长长长长长长长长长长长长长长长长',
      locationName: '测试超长标题显示效果',
      location: '测试地址',
      activityDate: tomorrow,
      time: '15:00 - 17:00',
      matchType: '5人制',
      maxPlayers: 10,
      fee: 25,
      createdBy: myOpenid,
      creatorName: '我',
      status: 'open',
      registrations: [],
      createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000)
    },

    // ========== 我报名的活动（4个）==========
    {
      title: '周六下午场，缺3人',
      location: '工人体育场',
      activityDate: tomorrow,
      time: '14:00-16:00',
      matchType: '5人制',
      maxPlayers: 10,
      fee: 40,
      createdBy: otherOpenids[0],
      creatorName: '张三',
      status: 'open',
      registrations: [
        { openid: otherOpenids[0], nickName: '张三', avatarUrl: '', status: 'confirmed' },
        { openid: myOpenid, nickName: '我', avatarUrl: '', status: 'confirmed' },
        { openid: otherOpenids[1], nickName: '李四', avatarUrl: '', status: 'confirmed' },
        { openid: otherOpenids[2], nickName: '王五', avatarUrl: '', status: 'confirmed' },
        { openid: otherOpenids[3], nickName: '赵六', avatarUrl: '', status: 'confirmed' },
        { openid: 'user1', nickName: '用户1', avatarUrl: '', status: 'confirmed' },
        { openid: 'user2', nickName: '用户2', avatarUrl: '', status: 'confirmed' }
      ],
      createdAt: new Date(now.getTime() - 12 * 60 * 60 * 1000)
    },
    {
      title: '周日晚场，求组队',
      location: '五棵松体育中心',
      activityDate: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
      time: '18:00-20:00',
      matchType: '7人制',
      maxPlayers: 14,
      fee: 60,
      createdBy: otherOpenids[1],
      creatorName: '李四',
      status: 'open',
      registrations: [
        { openid: otherOpenids[1], nickName: '李四', avatarUrl: '', status: 'confirmed' },
        { openid: myOpenid, nickName: '我', avatarUrl: '', status: 'pending' },
        { openid: otherOpenids[0], nickName: '张三', avatarUrl: '', status: 'confirmed' },
        { openid: otherOpenids[2], nickName: '王五', avatarUrl: '', status: 'confirmed' }
      ],
      createdAt: new Date(now.getTime() - 8 * 60 * 60 * 1000)
    },
    {
      title: '新手友好局，教踢球',
      location: '清华大学紫荆操场',
      activityDate: nextWeek,
      time: '09:00-11:00',
      matchType: '5人制',
      maxPlayers: 10,
      fee: 20,
      createdBy: otherOpenids[2],
      creatorName: '王五',
      status: 'open',
      registrations: [
        { openid: otherOpenids[2], nickName: '王五', avatarUrl: '', status: 'confirmed' },
        { openid: myOpenid, nickName: '我', avatarUrl: '', status: 'leave' },
        { openid: otherOpenids[0], nickName: '张三', avatarUrl: '', status: 'confirmed' }
      ],
      createdAt: new Date(now.getTime() - 6 * 60 * 60 * 1000)
    },
    {
      title: '已结束的历史活动',
      location: '历史场地',
      activityDate: yesterday,
      time: '14:00-16:00',
      matchType: '5人制',
      maxPlayers: 10,
      fee: 30,
      createdBy: otherOpenids[3],
      creatorName: '赵六',
      status: 'finished',
      registrations: [
        { openid: otherOpenids[3], nickName: '赵六', avatarUrl: '', status: 'confirmed' },
        { openid: myOpenid, nickName: '我', avatarUrl: '', status: 'confirmed' },
        { openid: otherOpenids[0], nickName: '张三', avatarUrl: '', status: 'confirmed' }
      ],
      createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
    },

    // ========== 其他人的活动（我没参与）（2个）==========
    {
      title: '公司内部友谊赛',
      locationName: '中关村软件园足球场',
      location: '北京市海淀区中关村软件园',
      activityDate: tomorrow,
      time: '12:00 - 14:00',
      matchType: '5人制',
      maxPlayers: 10,
      fee: 0,
      createdBy: otherOpenids[0],
      creatorName: '张三',
      status: 'open',
      registrations: [
        { openid: otherOpenids[0], nickName: '张三', avatarUrl: '', status: 'confirmed' },
        { openid: otherOpenids[1], nickName: '李四', avatarUrl: '', status: 'confirmed' }
      ],
      createdAt: new Date(now.getTime() - 4 * 60 * 60 * 1000)
    },
    {
      title: '这是一个测试超长地点名称的场地地址看看显示效果如何',
      location: '北京市朝阳区三里屯街道工人体育场北路甲2号盈科中心写字楼A座地下停车场旁边的足球场',
      activityDate: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000),
      time: '16:00-18:00',
      matchType: '7人制',
      maxPlayers: 14,
      fee: 80,
      createdBy: otherOpenids[1],
      creatorName: '李四',
      status: 'open',
      registrations: [
        { openid: otherOpenids[1], nickName: '李四', avatarUrl: '', status: 'confirmed' },
        { openid: otherOpenids[2], nickName: '王五', avatarUrl: '', status: 'confirmed' },
        { openid: otherOpenids[3], nickName: '赵六', avatarUrl: '', status: 'confirmed' },
        { openid: 'user3', nickName: '用户3', avatarUrl: '', status: 'confirmed' },
        { openid: 'user4', nickName: '用户4', avatarUrl: '', status: 'confirmed' },
        { openid: 'user5', nickName: '用户5', avatarUrl: '', status: 'confirmed' },
        { openid: 'user6', nickName: '用户6', avatarUrl: '', status: 'confirmed' },
        { openid: 'user7', nickName: '用户7', avatarUrl: '', status: 'confirmed' }
      ],
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000)
    }
  ]

  try {
    // 先清空现有测试数据（可选）
    // await db.collection('activities').where({}).remove()
    
    // 插入测试数据
    const result = await db.collection('activities').add({
      data: testData
    })
    
    return {
      success: true,
      message: `成功插入 ${testData.length} 条测试数据`,
      data: {
        myPublished: 4,      // 我发布的
        myRegistered: 4,     // 我报名的
        others: 2,           // 其他人的
        total: testData.length
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
