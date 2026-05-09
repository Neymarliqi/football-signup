# v3.0.2 更新日志

**发布日期**: 2026-05-09 ~ 2026-05-10

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
- **创建者保护**: `removeMember` 增加创建者不可移除校验；WXML 中创建者的"移除"按钮通过 `wx:if` 隐藏
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

### 4. 样式修复

- 成员列表项去掉底部边框线
- 操作按钮区域增加 `border: none; outline: none` 去除默认样式

### 5. 胜平负颜色修正

**修改文件**: `home.wxss`

| 结果 | 修正前 | 修正后 |
|------|--------|--------|
| 胜 | 🔴 红色 #f5222d | 🟢 绿色 #52c41a |
| 平 | 🟢 绿色 #52c41a | ⚪ 灰色 #999 |
| 负 | ⚪ 灰色 #ccc | 🔴 红色 #f5222d |

符合足球视觉惯例：赢球开心（绿），打平平淡（灰），输球难过（红）。

---

## 三、getTeamStats 数据统计 Bug 修复（云函数）

### 1. 时区偏移修复

**问题**: 日期筛选用 `.000Z`（UTC 零点），对应北京时间早8点，导致当日凌晨0~8点的活动被遗漏

**修复**: 前端所有日期从 `T00:00:00.000Z` 改为 `T00:00:00+08:00`（北京时间）

### 2. onFilterChange 切换筛选日期未重算

**问题**: 从"本年"切换到"本月"时，`statsStartDate` 仍保留"本年"的 `2026-01-01`，导致月度数据错误

**修复**: `onFilterChange` 中根据新 filter 重新调用 `calcDateRangeByFilter` 计算 `statsStartDate`/`statsEndDate`

### 3. 活动总数 → 比赛数

**问题**: "活动总数"统计所有非取消活动（含未录入比分的），但胜平负只计有 match_stats 的，导致数字不匹配（如10场活动但胜1平1负1）

**修复**: 新增 `matchCount` 字段（只计有 match_stats 的活动数），前端展示改为"比赛数"

### 4. 查询上限修复

**问题**: `team_members`/`team_casuals` 查询用 `.get()` 默认只返回20条，超过20个成员时 member/casual 类型判断错误

**修复**: 新增 `getAll()` 分页查询辅助函数，突破100条限制

---

## 四、saveTactics 云函数（新建）

### 战术板保存权限控制

**问题**: 前端直接操作 `tactics` 集合，受数据库权限"仅创建者可读写"限制，第一个保存的人之后其他人无法保存

**方案**: 新建 `saveTactics` 云函数，绕过数据库权限，在函数内部校验：

| 用户身份 | 查看战术板 | 保存/拖拽 |
|----------|-----------|----------|
| 活动创建者 | ✅ | ✅ |
| 已报名者（confirmed） | ✅ | ✅ |
| 其他用户 | ✅ | ❌ 仅查看 |

**修改文件**:
- 新建 `cloudfunctions/saveTactics/index.js` + `package.json`
- `tactics.js`: 保存逻辑从直接操作数据库改为调用云函数

---

## 需要手动操作

1. **部署云函数**:
   - `getTeamStats` → 右键 → 上传并部署
   - `saveTactics` → 右键 → 上传并部署（云端安装依赖）

2. **tactics 集合权限**: 保持"仅创建者可读写"即可，写操作已全部走云函数

3. **重新编译小程序**: 前端所有改动即时生效
