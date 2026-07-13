# CareerMate 全站温暖陪伴视觉统一 —— Codex 验收清单

## 一、分支与环境

```bash
# 切换到验收分支
git switch Xiaoxiao/unified-warm-ui

# 确认基线提交
git rev-parse --short HEAD   # 预期看到 1ab9d2b 在历史中

# 安装依赖（如需要）
npm.cmd install

# 启动开发服务器
npm.cmd run dev
# 默认端口 http://localhost:3000
```

## 二、自动化验证

```bash
# 完整门禁（约 2 分钟）
npm.cmd run verify
# 预期：secret:scan 通过 + lint 零警告 + typecheck 通过 + 62文件/348测试 通过 + migrations 通过 + build 成功

# E2E 测试（约 1.5 分钟，需关闭 dev server 避免端口冲突）
npm.cmd run test:e2e
# 预期：20/20 全部通过
```

## 三、手动逐页检查（桌面 1440×900 + 移动端 375×812）

每个页面检查以下项目：
- [ ] 控制台无红色报错（console.error / uncaught exception）
- [ ] Network 面板无 500 响应
- [ ] 页面无横向滚动条（`document.documentElement.scrollWidth <= window.innerWidth`）
- [ ] 视觉风格统一（紫蓝色调、圆角卡片、柔和阴影），无旧 Slate 黑白风格残留

### 演示账号
| 账号 | 密码 |
|------|------|
| `student_lin` | `careermate123` |
| `admin` | `careermate123` |

### 3.1 `/login` — 登录页
- [ ] 页面背景柔和紫蓝（`#F7F6FF`），左侧品牌说明 + 右侧白色认证卡片
- [ ] 账号/密码字段默认为空，不预填演示账号
- [ ] 展开"演示账号"折叠面板，点击按钮可填入对应账号
- [ ] 密码可切换显示/隐藏（👁 图标）
- [ ] Enter 键提交，提交中按钮禁用
- [ ] 用 `student_lin / careermate123` 登录成功进入 `/`

### 3.2 `/` — 聊天首页（视觉母版）
- [ ] 左侧 280px 白色侧栏，CM 紫色渐变图标
- [ ] 侧栏底部导航：成长概览/职业路径/模拟训练/资源中心/记忆权限
- [ ] 退出登录点击后跳转 `/login`（使用 POST 请求）
- [ ] 欢迎页：紫色渐变图标 + 4 个建议问题按钮（紫色边框）
- [ ] 发送消息：用户消息紫色气泡（右对齐），助手消息白色气泡（左对齐）
- [ ] 输入框聚焦时边框变紫色
- [ ] 右侧成长档案抽屉可展开
- [ ] 移动端 375px：侧栏变为滑出抽屉，有遮罩层

### 3.3 `/dashboard` — 成长概览
- [ ] 左上角显示"AI 产品经理 成长工作台"标题
- [ ] 三张指标卡：岗位匹配度/本月任务/待确认画像
- [ ] 能力雷达图使用品牌紫色
- [ ] "重生成路径"按钮可点击
- [ ] 底部匹配度说明 + 近期成长记录

### 3.4 `/path` — 职业路径
- [ ] 标题"3 年职业路径"+ 重规划按钮
- [ ] 计划摘要卡片（如有待确认版本）
- [ ] 当前月任务列表 + 状态下拉框
- [ ] 可展开的年度/季度/月度时间线
- [ ] 底部计划假设 + 风险提示

### 3.5 `/simulation` — 模拟训练
- [ ] 左侧三张场景卡片（跨岗位沟通/AI辅助办公/远程协作）
- [ ] 选中态：紫色边框 + 浅紫背景
- [ ] "开始新训练"按钮
- [ ] 训练区：用户消息紫色气泡，AI 消息浅紫背景
- [ ] 轮次进度提示（已完成 N/6 轮）
- [ ] 完成评分后显示得分

### 3.6 `/resources` — 资源中心
- [ ] 三个下拉筛选器（目标岗位/能力方向/资源类型）
- [ ] 弱能力推荐标签（可点击筛选）
- [ ] 资源卡片网格展示（标题+类型+描述+来源）

### 3.7 `/memory` — 记忆权限
- [ ] 三区域：长期记忆 / 隐私与数据 / 画像更新候选
- [ ] 记忆开关、添加、编辑、删除功能
- [ ] 导出 JSON 按钮
- [ ] 清空数据需输入 `CLEAR_MY_DATA` 确认词

### 3.8 `/admin` — 管理员后台（需 admin 账号登录）
- [ ] 普通用户（student_lin）访问 `/admin` 被重定向到 `/`
- [ ] Admin 登录后侧栏显示"Admin"入口（独立分组）
- [ ] 岗位草稿生成表单（岗位名称/分类/来源）
- [ ] 草稿列表：状态标签、结构校验结果、编辑/通过/拒绝按钮

### 3.9 `/onboarding` — 画像引导（新用户注册后进入）
- [ ] 左侧对话区：用户消息紫色气泡、AI 消息白色气泡
- [ ] 画像完整度进度条（品牌紫色）
- [ ] 右侧画像摘要面板
- [ ] 完整度 < 80% 时"确认并生成成长工作台"按钮禁用

## 四、设计令牌参考

所有页面应使用以下 `--cm-*` CSS 变量，不应出现旧 Slate 黑白风格：

| 令牌 | 用途 | 色值 |
|------|------|------|
| `--cm-canvas` | 页面背景 | `#F7F6FF` |
| `--cm-brand` | 品牌主色 | `#7568E8` |
| `--cm-brand-hover` | 悬停/链接 | `#5F51D8` |
| `--cm-text-strong` | 主文字 | `#27243A` |
| `--cm-text-subtle` | 提示文字 | `#777287` (WCAG AA) |
| `--cm-surface-soft` | 选中/悬停底色 | `#EEE9FF` |
| `--cm-border` | 边框 | `rgba(117,104,232,0.14)` |

## 五、回归风险点

以下为改造过程中发现的脆弱点，验收时重点检查：

1. **退出登录**：改用 POST `/api/auth/logout`（原为 GET `<a>` 链接），确认退出后确实清除会话
2. **Admin 守卫**：`workspace-page.tsx` 新增服务端 `role === "admin"` 检查
3. **登录回退**：无 `nextPath` 时进入 `/` 而非 `/dashboard`
4. **演示账号**：默认字段为空，通过折叠面板按钮填入（不再伪装成用户输入）
5. **E2E 选择器**：聊天首页保留了 `.chat-sidebar`、`.footer-link`、`.conversation-title-btn` 等 CSS 类名；Admin 草稿卡保留了 `.rounded-md.border` 类名

## 六、提交历史

```text
4d562f5 fix: E2E compatibility after warm UI migration
ac742fb feat: migrate all workspace views to warm UI design
0a6b1fd feat: redesign authentication experience
45821c6 refactor: split workspace views by responsibility
26c4b79 feat: unify authenticated application shell
64621ff feat: add shared warm UI primitives
463c8d4 refactor: establish CareerMate design tokens
1ab9d2b docs-unified-warm-ui-plan  ← 分支起点
```

## 七、完成定义

- [x] `npm.cmd run verify` 全部通过
- [x] `npm.cmd run test:e2e` 20/20 通过
- [ ] 9 个页面逐页手动验收无异常
- [ ] 桌面 + 移动端视口无横向溢出
- [ ] 聊天首页视觉无回退
- [ ] 控制台无未处理异常、无意外 500
- [ ] 分支 `Xiaoxiao/unified-warm-ui` 未合并、未删除
