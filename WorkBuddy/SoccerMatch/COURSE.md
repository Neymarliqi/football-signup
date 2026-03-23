# 约球助手 - 微信小程序开发实战课程

> 从零到上线，完整学习微信小程序开发

---

## 课程目标

学完本课程，你将掌握：
1. 微信小程序开发全流程
2. 微信云开发（数据库、云函数、云存储）
3. 腾讯地图选点插件集成
4. 自定义组件开发（TabBar）
5. 实际项目架构与设计思路

---

## 课程结构

```
模块1: 项目初始化 → 模块2: 数据库设计 → 模块3: 核心功能开发
   ↓                      ↓                       ↓
模块4: 地图集成 → 模块5: UI优化 → 模块6: 上架部署
```

---

## 模块1: 项目初始化（第1-2天）

### 1.1 为什么要这样搭建？

**微信小程序目录结构是固定的**，必须遵循：

```
miniprogram/        # 小程序前端代码
  ├── pages/        # 页面（每个页面独立文件夹）
  ├── components/   # 自定义组件
  ├── utils/        # 工具函数
  ├── app.js        # 小程序入口（初始化配置）
  ├── app.json      # 全局配置（路由、tabBar、权限）
  └── app.wxss      # 全局样式

cloudfunctions/     # 云函数（后端逻辑）
  ├── getMapSignature/
  └── ...

custom-tab-bar/     # 自定义 TabBar
```

### 1.2 必须掌握的核心文件

| 文件 | 作用 | 重点 |
|------|------|------|
| `app.js` | 全局数据、生命周期 | `onLaunch`、`globalData` |
| `app.json` | 路由配置、tabBar | `pages`、`tabBar`、`permission` |
| `project.config.json` | 项目配置 | `appid`、`cloudfunctionRoot` |

### 1.3 实战操作

**步骤1: 创建项目**

```bash
# 打开微信开发者工具
# 新建项目 → 选择"微信云开发"模板 → 填写 AppID
```

**步骤2: 配置 `project.config.json`**

```json
{
  "appid": "你的小程序 AppID",
  "cloudfunctionRoot": "cloudfunctions/",
  "miniprogramRoot": "miniprogram/"
}
```

**步骤3: 初始化云开发**

```javascript
// app.js
App({
  onLaunch() {
    wx.cloud.init({
      env: 'cloud1-5gbn5i1p97239e9d',  // 你的云开发环境 ID
      traceUser: true
    })
  }
})
```

### 1.4 课后练习

1. 创建一个新的空小程序项目
2. 配置 `app.json`，注册3个测试页面
3. 理解页面生命周期（`onLoad`、`onShow`、`onReady`）

---

## 模块2: 数据库设计（第3-4天）

### 2.1 为什么用云数据库？

**传统开发**：需要买服务器 + 安装数据库 + 配置防火墙
**云开发**：微信提供 MongoDB 风格数据库，免运维

### 2.2 数据库设计原则

1. **扁平化**：不要嵌套太深（NoSQL 不支持复杂关联查询）
2. **冗余字段**：适当冗余，避免频繁查询
3. **索引优化**：查询字段建索引

### 2.3 本项目的数据结构

#### activities（活动表）

```javascript
{
  _id: "活动ID",
  title: "周末踢球",
  date: "2026-03-24",
  time: "14:00",
  location: "奥体中心足球场",
  locationName: "奥体中心",
  latitude: 39.9,
  longitude: 116.4,
  maxPlayers: 22,
  cost: "免费",
  createdBy: "发布者 OpenID",
  status: "open",  // open、ongoing、finished、cancelled
  registrations: [  // 报名列表（冗余）
    { openid: "xxx", status: "confirmed", position: "CM" }
  ]
}
```

#### users（用户表）

```javascript
{
  _id: "用户ID",
  _openid: "用户 OpenID",
  nickName: "张三",
  avatarUrl: "https://...",
  positions: [  // 位置偏好（v1.1.2 新格式）
    { value: "CM", order: 1, label: "首" },
    { value: "ST", order: 2, label: "备" }
  ],
  createdAt: "2026-03-23"
}
```

#### announcements（公告表）

```javascript
{
  _id: "公告ID",
  title: "场地通知",
  content: "本周球场临时关闭",
  createdAt: "2026-03-23"
}
```

#### tactics（战术板表）

```javascript
{
  _id: "战术ID",
  activityId: "活动ID",
  formation: "4-3-3",
  players: [ { position: "GK", name: "张三" } ]
}
```

### 2.4 数据库权限配置

**为什么需要权限？** 防止用户恶意删除他人数据

```
activities:
{
  "read": true,  // 所有人可读
  "write": "doc._openid == auth.openid"  // 仅创建者可写
}

users:
{
  "read": true,
  "write": "doc._openid == auth.openid"  // 仅本人可写
}
```

### 2.5 实战操作

**创建集合**：

```bash
云开发控制台 → 数据库 → 添加集合
```

**设置权限**：

```bash
云开发控制台 → 数据库 → 集合 → 权限设置
```

### 2.6 课后练习

1. 在云开发控制台创建4个集合
2. 插入测试数据，手动查询验证
3. 理解 `_openid` 的作用（用户身份标识）

---

## 模块3: 核心功能开发（第5-7天）

### 3.1 首页（活动列表）

**核心逻辑**：
1. 查询数据库获取活动列表
2. 判断用户身份（发布者 vs 参与者）
3. 显示操作按钮

**代码实现**（`pages/index/index.js`）：

```javascript
Page({
  data: {
    activities: [],
    openid: ''
  },

  onLoad() {
    this.loadActivities()
    this.getOpenid()
  },

  // 加载活动列表
  async loadActivities() {
    const db = wx.cloud.database()
    const res = await db.collection('activities')
      .orderBy('date', 'desc')
      .get()
    this.setData({ activities: res.data })
  },

  // 获取用户 OpenID
  getOpenid() {
    wx.cloud.callFunction({ name: 'login' }).then(res => {
      this.setData({ openid: res.result.openid })
    })
  }
})
```

**关键点**：
- `db.collection('activities')` - 查询集合
- `.orderBy('date', 'desc')` - 按日期倒序
- `.get()` - 执行查询

### 3.2 创建活动

**核心逻辑**：
1. 表单验证
2. 写入数据库
3. 返回首页

**代码实现**（`pages/activity/create.js`）：

```javascript
Page({
  data: {
    form: { title: '', date: '', time: '', location: '' }
  },

  async submit() {
    const db = wx.cloud.database()
    await db.collection('activities').add({
      data: {
        ...this.data.form,
        createdBy: this.data.openid,
        status: 'open',
        createdAt: new Date()
      }
    })
    wx.showToast({ title: '发布成功' })
    wx.navigateBack()
  }
})
```

**关键点**：
- `.add({ data: {...} })` - 插入数据
- `...this.data.form` - 展开运算符
- `wx.cloud.database()` - 获取数据库实例

### 3.3 活动详情

**核心逻辑**：
1. 获取活动详情
2. 判断用户权限
3. 报名/取消报名

**报名实现**（`pages/activity/detail.js`）：

```javascript
async join() {
  const db = wx.cloud.database()
  const _ = db.command  // 数据库操作符

  await db.collection('activities').doc(this.data.activityId).update({
    data: {
      registrations: _.push({
        openid: this.data.openid,
        status: 'confirmed'
      })
    }
  })
  this.loadActivity()
}
```

**关键点**：
- `db.command.push()` - 数组追加操作
- `.doc(id).update()` - 更新单条数据

### 3.4 实战操作

1. 写一个简单的 Todo List 练增删改查
2. 理解数据库操作的 `add`、`update`、`remove`、`get`

---

## 模块4: 地图集成（第8天）

### 4.1 为什么用腾讯地图选点插件？

**原生地图 API**：
- 功能有限，只能获取经纬度
- 没有搜索功能

**腾讯地图选点插件**：
- 支持搜索地点
- UI 美观
- 无需自己写地图页面

### 4.2 插件配置

**app.json**：

```json
{
  "plugins": {
    "chooseLocation": {
      "version": "1.0.12",
      "provider": "wx76a9a06e5b4e693e"
    }
  }
}
```

**为什么这样配置？**
- `version`: 插件版本号（固定）
- `provider`: 插件 ID（腾讯官方提供）

### 4.3 调用插件

**代码实现**（`pages/activity/create.js`）：

```javascript
pickLocation() {
  const key = 'SXGBZ-RHQ6M-26V6Z-6UTTU-JGKUV-TVFJS'
  const referer = '约球助手'
  const category = '体育场馆,运动健身'

  wx.navigateTo({
    url: `plugin://chooseLocation/index?key=${key}&referer=${referer}&category=${category}`
  })
},

onShow() {
  // 从地图选点插件返回时获取数据
  const location = chooseLocation.getLocation()
  if (location) {
    this.setData({
      'form.latitude': location.latitude,
      'form.longitude': location.longitude,
      'form.location': location.name,
      'form.locationName': location.address
    })
  }
}
```

**关键点**：
- `plugin://chooseLocation/index` - 插件协议
- `key`: 腾讯地图 Key
- `chooseLocation.getLocation()` - 获取选中的位置

### 4.4 为什么关闭 SN 签名校验？

**SN 校验**：防止 Key 被盗用，需要后端加签名
**本项目选择**：关闭签名，用白名单（开发阶段）
**生产环境**：建议开启签名或设置白名单

### 4.5 实战操作

1. 申请腾讯地图 Key
2. 配置选点插件
3. 测试选点功能

---

## 模块5: UI优化（第9-10天）

### 5.1 为什么要重视 UI？

**用户留存率**：UI 好的用户留存率更高
**小程序审核**：微信对 UI 有规范要求
**品牌形象**：直接影响产品口碑

### 5.2 微信设计规范

**颜色规范**：

| 类型 | 颜色 | 用途 |
|------|------|------|
| 主色调 | `#07c160`（微信绿） | 核心操作、选中状态 |
| 背景色 | `#f5f5f5` | 页面背景 |
| 文字色 | `#333`（主）、`#666`（次）、`#999`（辅） | 文字层次 |

**视觉层次**：

```
主操作（深色背景）> 功能操作（绿色背景）> 分隔线 > 管理操作（灰色文字）
```

**实现代码**（`pages/index/index.wxss`）：

```css
.action-btn {
  background: #1a1a2e;  /* 主操作：深色 */
  color: #fff;
  padding: 12rpx 24rpx;
  border-radius: 8rpx;
}

.feature-btn {
  background: #07c160;  /* 功能操作：绿色 */
  color: #fff;
  padding: 12rpx 24rpx;
  border-radius: 8rpx;
}

.manage-link {
  color: #666;  /* 管理操作：灰色 */
  font-size: 26rpx;
}
```

### 5.3 自定义 TabBar

**为什么自定义？**
- 原生 TabBar 样式固定，无法自定义图标
- 需要中间的大圆形发布按钮

**实现步骤**：

**步骤1: app.json 开启自定义**

```json
{
  "tabBar": {
    "custom": true,  // 关键：开启自定义
    "list": [...]
  }
}
```

**步骤2: custom-tab-bar/index.wxml**

```html
<view class="tab-bar">
  <view class="tab-item" data-index="0" bindtap="switchTab">
    <view class="icon home"></view>
    <text class="label">约球</text>
  </view>
  <view class="tab-item publish" bindtap="publish">
    <view class="icon publish"></view>
  </view>
  <view class="tab-item" data-index="1" bindtap="switchTab">
    <view class="icon user"></view>
    <text class="label">我的</text>
  </view>
</view>
```

**步骤3: custom-tab-bar/index.wxss（CSS 绘制图标）**

```css
/* 房子图标 */
.home::before {
  content: '';
  width: 0;
  height: 0;
  border-left: 12rpx solid transparent;
  border-right: 12rpx solid transparent;
  border-bottom: 16rpx solid currentColor;
}
.home::after {
  content: '';
  width: 24rpx;
  height: 20rpx;
  background: currentColor;
  margin-top: -2rpx;
}
```

**为什么用 CSS 绘制？**
- 微信小程序不支持 SVG
- 用 CSS 绘制无需图片，体积小

### 5.4 实战操作

1. 使用 WeUI 组件库（微信官方 UI 库）
2. 练习 CSS 绘制简单图标

---

## 模块6: 上架部署（第11天）

### 6.1 上架前检查

```
□ 代码无 Bug
□ 隐私指引已填写
□ 地图 Key 有效
□ 云函数已部署
□ 体验版测试通过
```

### 6.2 提交审核

**版本描述**（复制）：

```
「约球助手」是一款足球活动报名管理工具，支持发布活动、
在线报名、场地导航等功能。本次优化 UI 体验，新增隐私指引。
```

**审核周期**：1-3 个工作日

### 6.3 云开发免费额度

| 资源 | 免费额度 |
|------|---------|
| 数据库读 | 50 万次/天 |
| 数据库写 | 30 万次/天 |
| 云函数调用 | 20 万次/天 |
| 云存储 | 5GB |

**监控用量**：云开发控制台 → 统计分析

---

## 课程总结

### 关键知识点

1. **小程序生命周期**：`onLoad`、`onShow`、`onReady`
2. **云数据库操作**：`add`、`update`、`get`、`remove`
3. **用户身份判断**：通过 `_openid` 区分用户
4. **权限控制**：数据库权限 + 业务逻辑双重控制
5. **UI 设计规范**：微信绿主色调、视觉层次分明

### 课后项目

做一个「记账小程序」，要求：
1. 记账、查账、删账
2. 数据存云数据库
3. 有简单的 TabBar
4. 符合微信设计规范

---

## 附录：常用代码片段

### 获取用户 OpenID

```javascript
wx.cloud.callFunction({ name: 'login' }).then(res => {
  console.log(res.result.openid)
})
```

### 数据库查询

```javascript
const db = wx.cloud.database()
db.collection('activities')
  .where({ status: 'open' })
  .orderBy('date', 'desc')
  .limit(10)
  .get()
  .then(res => console.log(res.data))
```

### 更新数据

```javascript
const db = wx.cloud.database()
db.collection('activities').doc('xxx').update({
  data: { status: 'finished' }
})
```

### Toast 提示

```javascript
wx.showToast({
  title: '操作成功',
  icon: 'success',
  duration: 2000
})
```

---

**课程结束，开始编码吧！**
