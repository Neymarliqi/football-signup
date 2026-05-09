# v3.0.2 更新日志

**发布日期**: 2026-05-09

---

## 一、match-stats 比分统计页

### 1. 球员类型标签（队员/散客）布局修复

**问题**: 标签内文字垂直不居中、标签与昵称换行错位

**修改文件**:
- `match-stats.wxml`: `<text>` 改为 `<view>`（小程序 `<text>` 不支持 flex 居中）
- `match-stats.wxss`: 重构 `.player-name-wrap` 和 `.player-type-tag` 样式

**最终方案**:
```
布局结构:
player-info-cell (flex, align-items: center)
  ├── player-avatar (80rpx 圆形)
  └── player-name-wrap (flex-column, gap: 4rpx)
        ├── player-name (昵称, max-width: 160rpx, 超长截断)
        └── player-type-tag (view, flex居中, align-self: flex-start 自适应宽度)
```

**关键CSS**:
```css
.player-name-wrap {
  display: flex;
  flex-direction: column;  /* 昵称在上，标签在下 */
  gap: 4rpx;
}

.player-type-tag {
  display: flex;           /* view + flex 实现文字垂直居中 */
  align-items: center;
  justify-content: center;
  height: 30rpx;           /* 固定高度 */
  padding: 0 10rpx;        /* 仅左右padding，高度由height控制 */
  border-radius: 15rpx;
  flex-shrink: 0;          /* 不被压缩 */
  align-self: flex-start;  /* 宽度自适应文字内容 */
}
```

**踩坑总结**:
- 微信小程序 `<text>` 组件对 `inline-block` + `line-height` 居中不可靠，`inline-flex` + `align-items: center` 也无效
- 必须用 `<view>` + `display: flex; align-items: center; justify-content: center` 才能稳定居中
- flex-column 子元素默认被拉伸到父宽度，需 `align-self: flex-start` 实现宽度自适应

### 2. 对手名称编辑即时保存

**修改文件**: `match-stats.js`

- 编辑对手名称后立即调用 `saveMatchStats` 云函数保存到云端
- 增加 loading 和错误提示

---

## 二、team/home 球队主页

### 1. 成员列表优化

**修改文件**: `home.js`, `home.wxml`, `home.wxss`

- **并行加载**: `loadMembers` 方法并行请求成员列表和活动列表（`Promise.all`）
- **报名次数统计**: 遍历球队所有活动的 registrations，统计每个成员的 confirmed 报名次数，显示"报名 N 次"
- **创建者保护**: `removeMember` 增加创建者不可移除校验
- **移除按钮隐藏**: WXML 中创建者的"移除"按钮通过 `wx:if="{{item.role !== 'creator'}}"` 隐藏
- **删除滑动提示箭头**: 移除 `.member-swipe-hint` 组件和样式

### 2. 成员信息布局调整

- 角色标签改为 flex 居中样式（`.member-role` 加 `inline-flex` + 圆角背景）
- 新增 `.member-meta` 容器横向排列角色标签和报名次数
- 报名次数样式 `.member-reg-count`: 蓝色文字 + 灰色背景标签
- 申请时间样式类名从 `.member-meta` 改为 `.application-meta` 避免冲突

### 3. 统计页类型标签重构

- `.stats-player-type` → `.type-tag`
- `.type-member` → `.type-tag-member`（蓝色 #1890ff）
- `.type-casual` → `.type-tag-casual`（橙色 #fa8c16）
- 样式对齐 match-stats 页的标签风格

### 4. 样式修复

- 成员列表项去掉底部边框线
- 操作按钮区域增加 `border: none; outline: none` 去除默认样式
