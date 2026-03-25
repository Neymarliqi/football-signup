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

### 1.1 完整目录结构解析

**项目根目录**：

```
SoccerMatch/
├── miniprogram/              # 小程序前端代码（必须）
├── cloudfunctions/           # 云函数（后端逻辑，可选）
├── custom-tab-bar/           # 自定义 TabBar（可选，app.json 开启 custom 后必须）
├── docs/                     # 项目文档（可选）
├── project.config.json       # 项目配置文件（必须）
├── project.private.config.json  # 私人配置（appid 等，不要提交 Git）
├── CHANGELOG.md              # 版本更新日志
├── DEPLOYMENT.md             # 上架部署指南
└── README.md                 # 项目说明文档
```

---

### 1.2 miniprogram/ 目录详解（前端核心）

**为什么前端代码要独立在 miniprogram/ 目录？**

```
1. 小程序编译时，只编译这个目录下的文件
2. 与后端（云函数）分离，职责清晰
3. 便于打包上传
```

**miniprogram/ 内部结构**：

```
miniprogram/
├── app.js                    # 小程序入口文件（必须）
├── app.json                  # 全局配置（必须）
├── app.wxss                  # 全局样式（可选）
├── sitemap.json              # 搜索配置（可选，默认就够用）
├── pages/                    # 所有页面（必须）
│   ├── index/                # 首页
│   │   ├── index.js          # 页面逻辑
│   │   ├── index.json        # 页面配置
│   │   ├── index.wxml        # 页面结构
│   │   └── index.wxss        # 页面样式
│   ├── activity/             # 活动相关页面
│   │   ├── detail/           # 活动详情
│   │   └── create/           # 创建/编辑活动
│   ├── profile/              # 个人中心
│   │   ├── profile.js
│   │   ├── history/          # 历史记录（子页面）
│   │   └── ...
│   ├── tactics/              # 战术板
│   ├── admin/                # 管理后台
│   └── privacy/              # 隐私保护指引
├── images/                   # 图片资源（本项目中用网络图片）
├── utils/                    # 工具函数（可选）
│   └── util.js               # 通用工具函数
└── components/               # 自定义组件（可选，本项目中用 custom-tab-bar）
```

**每个文件的作用**：

#### app.js（小程序入口）

```javascript
App({
  onLaunch() {  // 小程序启动时执行（只执行一次）
    this.initCloud()
  },

  onShow() {    // 小程序前台显示时执行
    console.log('显示')
  },

  initCloud() {
    wx.cloud.init({ env: 'cloud1-5gbn5i1p97239e9d' })
  }
})
```

**为什么叫 app.js？**
- `App()` 是小程序的构造函数，必须用这个
- 全局数据存在 `this.globalData`

---

#### app.json（全局配置）

```json
{
  "pages": [
    "pages/index/index",        // 必须把首页放在第一位
    "pages/activity/detail",
    "pages/activity/create"
  ],
  "tabBar": {
    "custom": true,             // 开启自定义 TabBar
    "list": [
      { "pagePath": "pages/index/index", "text": "约球" },
      { "pagePath": "pages/profile/profile", "text": "我的" }
    ]
  },
  "permission": {               // 权限声明（必须）
    "scope.userLocation": {
      "desc": "获取您的位置用于显示踢球地点"
    }
  },
  "plugins": {                  // 插件配置（腾讯地图）
    "chooseLocation": {
      "version": "1.0.12",
      "provider": "wx76a9a06e5b4e693e"
    }
  },
  "window": {                   // 窗口外观
    "navigationBarBackgroundColor": "#1a1a2e",
    "navigationBarTitleText": "⚽ 约球"
  }
}
```

**为什么 pages 数组的第一页是首页？**
- 微信启动时，默认加载 pages 数组的第一页
- 顺序错了会导致首页错误

---

#### app.wxss（全局样式）

```css
/* 定义全局变量和通用样式 */
page {
  background: #f5f5f5;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;
}

.container {
  min-height: 100vh;
}
```

**为什么要有全局样式？**
- 避免每个页面重复写相同代码
- 统一字体、颜色等基础样式

---

### 1.3 pages/ 目录详解（页面文件）

**每个页面必须包含 4 个文件**：

| 文件 | 作用 | 必需 |
|------|------|------|
| `xxx.js` | 页面逻辑（数据处理、事件处理） | ✅ 必须 |
| `xxx.json` | 页面配置（标题、下拉刷新等） | ✅ 必须（可以为空 `{}`） |
| `xxx.wxml` | 页面结构（类似 HTML） | ✅ 必须 |
| `xxx.wxss` | 页面样式（类似 CSS） | ⚠️ 可选 |

**示例：pages/index/index.js**

```javascript
Page({
  data: {              // 页面数据（双向绑定）
    activities: [],
    loading: false
  },

  onLoad() {           // 页面加载时执行
    this.loadActivities()
  },

  onShow() {           // 页面显示时执行（每次都执行）
    // 用于刷新数据
  },

  async loadActivities() {  // 自定义方法
    this.setData({ loading: true })
    const res = await wx.cloud.database().collection('activities').get()
    this.setData({
      activities: res.data,
      loading: false
    })
  }
})
```

**为什么用 Page() 而不是 App()？**
- `App()` 是小程序入口，全局只有一个
- `Page()` 是页面入口，每个页面一个

---

### 1.4 cloudfunctions/ 目录详解（云函数）

**为什么要有云函数？**

```
传统开发：前端 → 请求服务器 → 服务器处理 → 返回数据
云开发：    前端 → 云函数 → 数据库 → 返回数据

优势：
1. 无需买服务器
2. 自动扩容
3. 与微信生态深度集成
```

**cloudfunctions/ 结构**：

```
cloudfunctions/
├── getMapSignature/         # 云函数示例
│   ├── index.js            # 云函数入口（必须）
│   ├── package.json        # 依赖配置
│   └── cloudfunctions/     # 依赖安装后生成
└── login/                  # 登录云函数
    └── index.js
```

**云函数示例（login）**：

```javascript
// cloudfunctions/login/index.js
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  return {
    openid: wxContext.OPENID,  // 用户身份标识
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID
  }
}
```

**调用云函数**：

```javascript
wx.cloud.callFunction({
  name: 'login'
}).then(res => {
  console.log(res.result.openid)
})
```

---

### 1.5 custom-tab-bar/ 目录详解（自定义 TabBar）

**为什么要自定义 TabBar？**

```
原生 TabBar 限制：
- 图标只能是图片
- 样式固定，无法自定义

自定义 TabBar 优势：
- 图标可以是 CSS 绘制
- 中间可以有大圆形按钮
- 完全自定义样式
```

**custom-tab-bar 结构**：

```
custom-tab-bar/
├── index.js      # TabBar 逻辑
├── index.json    # TabBar 配置（可省略）
├── index.wxml    # TabBar 结构
└── index.wxss    # TabBar 样式
```

**index.js**：

```javascript
Component({
  data: {
    selected: 0  // 当前选中的索引
  },

  methods: {
    switchTab(e) {
      const index = e.currentTarget.dataset.index
      wx.switchTab({ url: `/pages/index/index` })
      this.setData({ selected: index })
    }
  }
})
```

**index.wxml**：

```html
<view class="tab-bar">
  <view class="tab-item" data-index="0" bindtap="switchTab">
    <view class="icon home"></view>
    <text class="label">约球</text>
  </view>
</view>
```

**页面同步选中状态**：

```javascript
// pages/index/index.js
Page({
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
  }
})
```

---

### 1.6 核心配置文件

#### project.config.json（项目配置）

```json
{
  "appid": "wx1234567890abcdef",  // 小程序 AppID
  "cloudfunctionRoot": "cloudfunctions/",  // 云函数目录
  "miniprogramRoot": "miniprogram/",        // 小程序代码目录
  "setting": {
    "urlCheck": false,        // 开发时不检查域名
    "es6": true,              // 启用 ES6
    "postcss": true           // 启用 PostCSS
  }
}
```

**为什么需要这个文件？**
- 团队协作时，统一项目配置
- 记录云开发环境、编译选项等

---

#### project.private.config.json（私人配置）

```json
{
  "appid": "你的私人 AppID"
}
```

**为什么不要提交到 Git？**
- 包含个人隐私信息（AppID、项目密钥）
- 团队成员用自己的 AppID 开发

---

### 1.7 文件执行顺序（前后逻辑）

**小程序启动流程**：

```
1. 读取 project.config.json（获取 AppID、项目配置）
2. 读取 app.json（获取页面列表、TabBar 配置）
3. 执行 app.js（初始化云开发、全局数据）
4. 加载 pages[0]（首页）
5. 执行首页的 onLoad → onShow
```

**页面切换流程**：

```
用户点击 → 执行 onLoad（首次加载）
        → 执行 onShow（每次显示）
        → 渲染 wxml → 应用 wxss
```

**数据更新流程**：

```
this.setData({ activities: newData })
     ↓
触发页面重新渲染
     ↓
更新 wxml 中的 {{activities}}
```

---

### 1.8 必须掌握的核心文件总结

| 文件 | 作用 | 必需 |
|------|------|------|
| `app.js` | 小程序入口、全局数据 | ✅ 必须 |
| `app.json` | 全局配置（路由、TabBar、权限） | ✅ 必须 |
| `project.config.json` | 项目配置（AppID、云函数路径） | ✅ 必须 |
| `pages/xxx/xxx.js` | 页面逻辑 | ✅ 必须 |
| `pages/xxx/xxx.json` | 页面配置 | ✅ 必须（可空） |
| `pages/xxx/xxx.wxml` | 页面结构 | ✅ 必须 |
| `pages/xxx/xxx.wxss` | 页面样式 | ⚠️ 可选 |
| `cloudfunctions/xxx/index.js` | 云函数 | ⚠️ 可选 |
| `custom-tab-bar/index.js` | 自定义 TabBar | ⚠️ 可选 |

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
