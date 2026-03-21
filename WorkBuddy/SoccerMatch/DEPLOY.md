# ⚽ 约球助手小程序 - 部署指南

## 数据库集合设计

### 1. activities（活动表）
```json
{
  "_id": "自动生成",
  "title": "周五11人制足球赛",
  "description": "活动描述",
  "matchType": "11人制",
  "activityDate": "Date对象",
  "time": "19:00 - 21:00",
  "startTime": "19:00",
  "endTime": "21:00",
  "locationName": "XX足球场 A号场",
  "location": "XX市XX区XX路XX号",
  "latitude": 23.123,
  "longitude": 113.456,
  "fieldType": "天然草",
  "maxPlayers": 16,
  "fee": 30,
  "deadline": "报名截止时间",
  "allowPending": true,
  "notice": "注意事项...",
  "status": "open",
  "registrations": [
    {
      "openid": "用户openid",
      "nickName": "张三",
      "avatarUrl": "cloud://xxx.png",
      "position": "CM",
      "status": "confirmed",
      "leaveReason": "",
      "registerTime": "Date对象"
    }
  ],
  "createdBy": "管理员openid",
  "createdAt": "Date对象",
  "updatedAt": "Date对象"
}
```

### 2. announcements（公告表）
```json
{
  "_id": "自动生成",
  "content": "公告内容",
  "active": true,
  "createdAt": "Date对象",
  "createdBy": "管理员openid"
}
```

### 3. users（用户表）
```json
{
  "_id": "自动生成",
  "openid": "用户openid",
  "nickName": "球员昵称",
  "avatarUrl": "cloud://xxx.png",
  "position": "CM",
  "createdAt": "Date对象",
  "updatedAt": "Date对象"
}
```

### 4. tactics（战术表）
```json
{
  "_id": "自动生成",
  "activityId": "活动ID",
  "formation": "4-3-3",
  "positions": {
    "openid1": { "x": 50, "y": 90, "posLabel": "GK" },
    "openid2": { "x": 30, "y": 70, "posLabel": "CB" }
  },
  "createdAt": "Date对象",
  "updatedAt": "Date对象"
}
```

### 5. admins（管理员表）
```json
{
  "_id": "自动生成",
  "openid": "管理员openid",
  "createdAt": "Date对象"
}
```

---

## 数据库权限配置

### activities 集合权限
```json
{
  "read": true,
  "write": "auth.openid == resource.data.createdBy",
  "create": "auth.openid != null",
  "delete": "auth.openid == resource.data.createdBy"
}
```

建议使用**安全规则**而非简易权限：
```
{
  "read": true,
  "write": "doc.createdBy == auth.openid"
}
```

### announcements / tactics / admins
- read: true
- write: auth.openid != null（建议限制为管理员）

---

## 部署步骤

### 第一步：微信开发者工具配置
1. 打开微信开发者工具，导入本项目
2. 填写你的 AppID
3. 开通云开发环境，记录 **envId**

### 第二步：修改环境ID
打开 `miniprogram/app.js`，修改：
```js
wx.cloud.init({
  env: 'your-env-id',  // 替换为你的云开发环境ID
  traceUser: true,
})
```

### 第三步：部署云函数
在微信开发者工具中，右键点击以下文件夹，选择"上传并部署"：
- cloudfunctions/getOpenid/
- cloudfunctions/updateRegistration/
- cloudfunctions/cancelRegistration/

### 第四步：创建数据库集合
在云开发控制台 -> 数据库，创建以下集合：
- activities
- announcements
- users
- tactics
- admins

### 第五步：添加管理员
在 admins 集合中手动添加一条记录：
```json
{
  "openid": "你的微信openid"
}
```
（openid 可在小程序启动后通过 wx.getStorageSync('openid') 获取）

### 第六步：创建测试活动
在 activities 集合中添加一条测试数据即可开始使用。

---

## 功能说明

| 功能 | 说明 |
|------|------|
| 活动列表 | 首页展示所有活动，支持按状态筛选 |
| 活动详情 | 查看踢球时间、地点、人数统计 |
| 报名 | 支持报名/待定/请假三种状态 |
| 人数限制 | 满员后自动提示，可待定候补 |
| 战术板 | 可视化足球场，支持5种阵型预设 |
| 个人中心 | 修改头像昵称、查看参与记录 |
| 管理后台 | 发布活动、管理公告、查看球员 |
| 分享邀请 | 一键分享活动给队友 |
| 地图导航 | 点击地址直接调起地图导航 |

---

## 技术栈
- 微信小程序原生开发
- 微信云开发（数据库 + 云函数 + 云存储）
- 无需额外服务器
