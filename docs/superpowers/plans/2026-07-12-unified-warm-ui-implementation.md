# CareerMate Unified Warm UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不重写业务的前提下，让登录、画像引导和所有登录后页面统一为聊天首页的温暖紫蓝视觉，并建立可持续复用的设计系统。

**Architecture:** 保留 `Workspace` 的数据加载和现有业务接口，先提炼全局令牌与通用组件，再用共享 `AppShell` 替换两套侧栏，最后将 `workspace.tsx` 中的业务视图逐个拆出。每个页面迁移后立即运行相关 E2E，最终做多视口和截图验收。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4、CSS variables、Lucide React、Recharts、Vitest、Playwright。

---

## 一、强制实施边界

- [ ] 不创建新项目，不改变现有路由。
- [ ] 不修改 API、Prisma schema、迁移文件、SQLite 数据和 seed。
- [ ] 不改变画像确认、计划版本、模拟训练、百宝箱降级和来源标注规则。
- [ ] 不引入 shadcn、MUI、Ant Design 或其他 UI 框架。
- [ ] 不运行 `npm audit fix --force`，不做无关依赖升级。
- [ ] 不一次性重写 `workspace.tsx`；每迁移一个视图就验证并提交。
- [ ] 保留现有可访问名称，尤其是 E2E 使用的“进入 CareerMate”“确认新版本”“开始新训练”等文本。

## 二、目标文件结构

### 新建设计系统

```text
src/components/ui/
  button.tsx
  field.tsx
  surface-card.tsx
  status-badge.tsx
  inline-alert.tsx
  empty-state.tsx
  confirm-dialog.tsx
  skeleton.tsx

src/components/shell/
  app-shell.tsx
  product-sidebar.tsx
  page-header.tsx
  mobile-navigation.tsx
  nav-items.ts
```

### 拆分业务视图

```text
src/features/dashboard/dashboard-view.tsx
src/features/onboarding/onboarding-view.tsx
src/features/path/path-view.tsx
src/features/resources/resource-view.tsx
src/features/memory/memory-view.tsx
src/features/admin/admin-view.tsx
src/features/simulation/simulation-view.tsx   # 保留文件，迁移视觉
```

### 保留为控制器

```text
src/components/workspace.tsx       # 只负责 loadAll、共享状态、视图编排
src/components/workspace-page.tsx  # 服务端登录/画像/Admin 权限守卫
```

## Task 0：建立视觉基线和回归基线

**Files:**

- Read: `src/app/globals.css`
- Read: `src/components/chat/*`
- Read: `src/components/workspace.tsx`
- Read: `src/components/login-form.tsx`
- Read: `src/features/simulation/simulation-view.tsx`
- Test: `e2e/chat-home.spec.ts`
- Test: `e2e/p0-flows.spec.ts`

- [ ] 记录改造前的 Git 状态，只处理本计划范围内文件。
- [ ] 运行 `npm.cmd run verify`，预期 62 个测试文件、348 个测试、迁移冒烟和生产构建通过。
- [ ] 运行 `npm.cmd run test:e2e`，记录当前 20 条 E2E 基线。
- [ ] 在 1440×900 和 375×812 下保存 `/`、`/login`、`/dashboard`、`/path` 的改造前截图，仅用于对比，不提交真实用户数据截图。
- [ ] 提交说明：此任务不改代码，不创建提交。

## Task 1：提炼全局设计令牌

**Files:**

- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] 在 `:root` 中建立 `--cm-*` 令牌，至少覆盖 canvas、surface、surface-soft、brand、brand-hover、accent、text-strong、text-muted、text-subtle、border、success、info、warning、danger、五级圆角、两级阴影、sidebar/content/reading 宽度和动效时长。
- [ ] 将 `body` 字体改为 `var(--font-geist-sans), "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif`。
- [ ] 增加统一的 `focus-visible` 和 `prefers-reduced-motion` 规则。
- [ ] 先只把聊天首页硬编码颜色映射到令牌，渲染结果必须与当前截图基本一致。
- [ ] 运行 `npm.cmd run lint` 和 `npm.cmd run typecheck`。
- [ ] 运行聊天首页桌面与移动 E2E。
- [ ] 提交：`git commit -m "refactor: establish CareerMate design tokens"`。

## Task 2：建立通用 UI 基础组件

**Files:**

- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/field.tsx`
- Create: `src/components/ui/surface-card.tsx`
- Create: `src/components/ui/status-badge.tsx`
- Create: `src/components/ui/inline-alert.tsx`
- Create: `src/components/ui/empty-state.tsx`
- Create: `src/components/ui/confirm-dialog.tsx`
- Create: `src/components/ui/skeleton.tsx`

- [ ] `Button` 支持 `primary | secondary | ghost | danger | icon`，支持 loading、disabled、图标、`type` 和原生 button 属性；高度至少 44px。
- [ ] `Field` 用 `useId` 关联 label、description、error，支持 input/select/textarea 组合，但不把业务状态写入组件。
- [ ] `SurfaceCard` 支持 title、description、action、padding 变体；卡片不得自带业务色。
- [ ] `StatusBadge` 的状态必须同时包含文字/图标，不只靠颜色。
- [ ] `InlineAlert` 支持 info/success/warning/error，并设置适当 role。
- [ ] `ConfirmDialog` 支持 Escape、遮罩关闭、初始焦点、关闭后焦点返回；危险操作按钮使用 danger。
- [ ] `Skeleton` 和加载提示提供 `aria-busy`，在 reduced motion 下停止动画。
- [ ] 用一个临时内部演示区域或现有页面逐个接入，不创建公开 `/design-system` 路由。
- [ ] 运行 lint、typecheck 和现有测试。
- [ ] 提交：`git commit -m "feat: add shared warm UI primitives"`。

## Task 3：统一登录后应用外壳和退出登录

**Files:**

- Create: `src/components/shell/nav-items.ts`
- Create: `src/components/shell/app-shell.tsx`
- Create: `src/components/shell/product-sidebar.tsx`
- Create: `src/components/shell/page-header.tsx`
- Create: `src/components/shell/mobile-navigation.tsx`
- Modify: `src/components/chat/conversation-sidebar.tsx`
- Modify: `src/components/chat/chat-home.tsx`
- Modify: `src/components/workspace.tsx`
- Modify: `src/components/workspace-page.tsx`

- [ ] 在 `nav-items.ts` 中只定义一份用户导航：成长概览 `/dashboard`、职业路径 `/path`、模拟训练 `/simulation`、资源中心 `/resources`、记忆权限 `/memory`。
- [ ] `ProductSidebar` 统一品牌、导航、active 状态、候选角标、用户姓名和退出按钮；支持 `chat` 与 `workspace` 两种中部 slot。
- [ ] 聊天 variant 保留“新对话 + 会话历史”；workspace variant 显示“返回 AI 对话”主入口，不强制加载聊天历史。
- [ ] 当前页面链接设置 `aria-current="page"`。
- [ ] `AppShell` 桌面固定 280px 侧栏，主区最大 1180px；移动端使用抽屉。
- [ ] 抽屉支持菜单按钮、遮罩、关闭按钮、Escape 和焦点返回，按钮设置 `aria-expanded`、`aria-controls`。
- [ ] 将聊天侧栏退出从错误的 GET `<a>` 改成调用 `POST /api/auth/logout` 的共享按钮，成功后跳转 `/login`。
- [ ] `WorkspacePage` 在 `view === "admin"` 且用户不是管理员时重定向到 `/` 或返回 403 页面；普通导航不得显示 Admin。
- [ ] 聊天首页接入共享品牌、导航和用户区后，保证会话创建、切换、重命名、删除和成长档案抽屉不变。
- [ ] 在 `e2e/chat-home.spec.ts` 增加“聊天进入成长概览仍显示同一品牌外壳”和“退出后回登录页”的断言。
- [ ] 运行聊天首页全部 E2E。
- [ ] 提交：`git commit -m "feat: unify authenticated application shell"`。

## Task 4：将 Workspace 缩减为数据控制器

**Files:**

- Modify: `src/components/workspace.tsx`
- Create: `src/features/dashboard/dashboard-view.tsx`
- Create: `src/features/onboarding/onboarding-view.tsx`
- Create: `src/features/path/path-view.tsx`
- Create: `src/features/resources/resource-view.tsx`
- Create: `src/features/memory/memory-view.tsx`
- Create: `src/features/admin/admin-view.tsx`

- [ ] 先逐段移动现有 Dashboard、Onboarding、PathView、ResourceView、MemoryView、AdminView，不改变函数逻辑和 API 调用。
- [ ] 每个视图定义明确 props 类型；不要继续扩散 `any`，但不在本轮重构服务端 DTO。
- [ ] 保留 `Workspace` 的 `loadAll`、notice、AI runtime 和 refresh 编排。
- [ ] 删除 `workspace.tsx` 内部旧 `Panel`、`Button`、旧 nav 和 `CareerMateCompanion`，由共享组件替代。
- [ ] `workspace.tsx` 目标控制在约 300 行以内；每个业务视图文件只承担一个页面。
- [ ] 每移动一个视图先运行 typecheck，再继续下一个，避免一次产生大量难定位错误。
- [ ] 运行全部单元测试和现有 E2E。
- [ ] 提交：`git commit -m "refactor: split workspace views by responsibility"`。

## Task 5：重做登录和注册视觉

**Files:**

- Modify: `src/components/login-form.tsx`
- Modify: `src/app/login/page.tsx`（仅在需要传递展示配置时）
- Test: `e2e/p0-flows.spec.ts`
- Create: `e2e/unified-shell.spec.ts`

- [ ] 使用独立认证布局：桌面左侧品牌说明、右侧白色认证卡；移动端品牌 + 单卡片。
- [ ] 保留登录/注册双模式、账号/昵称/密码字段和原错误恢复逻辑。
- [ ] 使用 `<form onSubmit>`，让 Enter 可以提交；提交期间禁用切换和提交按钮。
- [ ] 登录无 `nextPath` 时回退 `/`，注册仍根据接口进入 `/onboarding`。
- [ ] 默认字段为空；通过明确的“填入演示账号”按钮填入 `student_lin / careermate123`，演示账号说明折叠展示。
- [ ] 增加显示/隐藏密码、输入错误、服务不可用和提交中状态；不要泄露真实凭据。
- [ ] 保留 `账号`、`昵称`、`密码` label 和 `进入 CareerMate`、`创建账号`按钮名称。
- [ ] E2E 覆盖正常登录、登录/注册切换、空响应恢复、Enter 提交和移动端无溢出。
- [ ] 提交：`git commit -m "feat: redesign authentication experience"`。

## Task 6：迁移画像引导

**Files:**

- Modify: `src/features/onboarding/onboarding-view.tsx`
- Modify: `src/components/workspace.tsx`
- Test: `e2e/p0-flows.spec.ts`

- [ ] 使用沉浸式引导壳层，不显示普通用户全导航，保留品牌和退出入口。
- [ ] 中央区域使用聊天气泡、统一输入框和发送按钮；右侧显示画像完整度和已提取摘要。
- [ ] 768px 以下摘要变为可展开底部区域。
- [ ] 保留历史恢复、失败后恢复输入、80% 阈值、正式确认和 AI 运行模式。
- [ ] 保留输入 placeholder `/一次可以告诉我多项信息/` 和按钮“确认并生成成长工作台”。
- [ ] E2E 重跑新用户注册 → 两轮引导 → 完成 → `/`。
- [ ] 提交：`git commit -m "feat: align onboarding with chat experience"`。

## Task 7：迁移成长概览

**Files:**

- Modify: `src/features/dashboard/dashboard-view.tsx`
- Modify: `src/components/shell/page-header.tsx`（仅增加通用 slot，不写 Dashboard 业务）
- Test: `e2e/unified-shell.spec.ts`

- [ ] PageHeader 显示问候、目标职业、专业、每周时间和 AI 模式。
- [ ] 指标卡展示岗位匹配度、本周/本月任务和待确认画像；数字与解释同时显示。
- [ ] 能力雷达使用品牌色，但保证坐标文字可读和 375px 下不溢出。
- [ ] 当前行动卡保留任务、截止周和状态；无计划时提供进入聊天或生成计划的清晰空状态。
- [ ] 匹配说明、薄弱能力和近期日志使用统一卡片和状态标签。
- [ ] “重新生成路径”显示 loading、错误和成功反馈；不改变后端生成逻辑。
- [ ] E2E 验证从聊天确认每周时间后，Dashboard 仍显示更新值。
- [ ] 提交：`git commit -m "feat: redesign growth dashboard"`。

## Task 8：迁移职业路径

**Files:**

- Modify: `src/features/path/path-view.tsx`
- Reuse: `src/components/chat/plan-summary-card.tsx`
- Test: `e2e/chat-home.spec.ts`
- Test: `e2e/p0-flows.spec.ts`

- [ ] 首屏先展示计划版本、职业、生成来源、AI 模式和待确认新版本。
- [ ] 继续复用 `PlanSummaryCard`，不得复制一份新的确认逻辑。
- [ ] 依次展示本周行动、90 天目标、12 个月里程碑，完整 3 年/季度/月时间线放入可展开区域。
- [ ] 任务状态 select 保留原值、禁用和失败恢复逻辑。
- [ ] 重规划必须生成待确认版本，不能直接覆盖当前计划。
- [ ] 保留“3 年职业路径”“确认新版本”等现有可访问标题和按钮名称。
- [ ] E2E 覆盖聊天生成计划 → 确认 → 路径页 → 刷新仍保留。
- [ ] 提交：`git commit -m "feat: redesign career path workspace"`。

## Task 9：迁移模拟训练

**Files:**

- Modify: `src/features/simulation/simulation-view.tsx`
- Test: `e2e/p0-flows.spec.ts`

- [ ] 删除该文件内部重复的旧 Panel/Button，改用共享组件。
- [ ] 三个场景改为柔和可选卡；选中态使用浅紫表面 + 主色边框，不使用黑底。
- [ ] 对话区复用聊天气泡语言，保留训练回答 textarea。
- [ ] 清楚显示轮次进度、3 轮评分门槛、6 轮上限和实际 AI 模式。
- [ ] 完成卡显示得分和“画像候选待确认”，提供前往 `/memory` 的入口。
- [ ] 保留最近五次训练历史和切换查看。
- [ ] E2E 完整运行三轮训练并评分。
- [ ] 提交：`git commit -m "feat: redesign simulation training workspace"`。

## Task 10：迁移资源中心

**Files:**

- Modify: `src/features/resources/resource-view.tsx`
- Test: `e2e/unified-shell.spec.ts`

- [ ] 三个筛选器使用统一 Field，在窄屏下纵向排列。
- [ ] 薄弱能力显示为推荐标签，选中时带文字与图标状态。
- [ ] 资源卡展示标题、类型、说明和来源；来源不存在链接时只显示机构文字。
- [ ] 页面说明当前正式资源库覆盖首批精品职业，避免表现为任意职业完整资源库。
- [ ] 提供加载、空结果和筛选后无结果状态。
- [ ] E2E 验证三个筛选器工作、空状态可见、375px 无溢出。
- [ ] 提交：`git commit -m "feat: redesign learning resource center"`。

## Task 11：迁移记忆权限与隐私

**Files:**

- Modify: `src/features/memory/memory-view.tsx`
- Reuse: `src/components/chat/profile-candidate-card.tsx` 或抽取其纯展示部分
- Reuse: `src/components/ui/confirm-dialog.tsx`
- Test: `e2e/unified-shell.spec.ts`

- [ ] 使用“画像候选、长期记忆、数据隐私”清晰分区；桌面可用标签页或分区卡，移动端不得隐藏重要操作。
- [ ] 画像候选展示旧值、新值、依据、置信度和影响，确认/拒绝语义与聊天卡一致。
- [ ] 长期记忆保留开关、创建、编辑、删除；用站内弹窗替换 `window.prompt`。
- [ ] 关闭记忆时明确“已有记忆仍保留”。
- [ ] 导出 JSON 为普通次级操作。
- [ ] 清空成长数据放入危险区域，保留 `CLEAR_MY_DATA` 输入，并增加最终确认弹窗。
- [ ] 清空成功后刷新用户状态并跳转 `/onboarding`。
- [ ] E2E 覆盖候选确认、记忆开关、编辑弹窗、删除确认、错误确认词无法清空。
- [ ] 提交：`git commit -m "feat: redesign memory and privacy controls"`。

## Task 12：迁移 Admin

**Files:**

- Modify: `src/features/admin/admin-view.tsx`
- Modify: `src/components/workspace-page.tsx`
- Test: `e2e/p0-flows.spec.ts`
- Test: `e2e/unified-shell.spec.ts`

- [ ] 页面头显示 Admin 标识，普通用户导航不显示 Admin。
- [ ] 普通用户直接访问 `/admin` 时由服务端保护，不加载管理数据。
- [ ] 草稿生成表单使用统一 Field；来源 textarea 保留多行输入。
- [ ] 草稿卡展示状态、结构校验、来源、审核说明和动作。
- [ ] 编辑和拒绝从 `window.prompt` 改为站内弹窗/抽屉。
- [ ] 对 `draft.content` 做安全解析；异常内容显示错误卡，不让整页崩溃。
- [ ] 保留通过前必须结构校验成功的规则。
- [ ] E2E 覆盖普通用户不可见、管理员生成/编辑/拒绝/通过和正式库展示。
- [ ] 提交：`git commit -m "feat: redesign and protect admin workspace"`。

## Task 13：响应式、无障碍和统一状态收口

**Files:**

- Modify: `src/app/globals.css`
- Modify: `src/components/shell/*`
- Modify: 所有已迁移视图中发现的局部问题
- Create/Modify: `e2e/unified-shell.spec.ts`

- [ ] 统一断点：桌面 ≥1200、紧凑/平板 769—1199、移动 ≤768。
- [ ] 1440×900、768×1024、375×812 下逐页检查 `/login`、`/onboarding`、`/`、`/dashboard`、`/path`、`/simulation`、`/resources`、`/memory`、`/admin`。
- [ ] 每页断言 `document.documentElement.scrollWidth <= window.innerWidth`。
- [ ] 检查键盘 Tab 顺序、focus-visible、Escape 关闭抽屉/弹窗、焦点返回。
- [ ] hover 才显示的操作在 `:focus-within` 时也必须显示。
- [ ] 检查正文、按钮、placeholder 和状态文字对比度；深色正文链接使用 `#5F51D8`。
- [ ] 所有 loading、empty、error、success、disabled 状态都有可读文本。
- [ ] 加入 reduced-motion 验证，关闭抽屉动画后仍可用。
- [ ] 提交：`git commit -m "fix: complete responsive and accessible UI states"`。

## Task 14：视觉回归、清理和最终验收

**Files:**

- Modify: `e2e/chat-home.spec.ts`
- Modify: `e2e/p0-flows.spec.ts`
- Modify: `e2e/unified-shell.spec.ts`
- Optional Create: `e2e/visual-regression.spec.ts`
- Delete only after zero references: `src/features/chat/chat-view.tsx`（如果已无引用）

- [ ] 将易碎的 `.footer-link` 等纯样式选择器改为 role + name；只有共享外壳使用稳定 `data-testid="app-shell"`、`primary-sidebar`、`page-content`、`mobile-navigation`。
- [ ] 保留聊天全部业务回归，不因 UI 改造删减断言。
- [ ] 增加统一外壳、当前导航、Admin 权限、退出登录和多视口测试。
- [ ] 可选建立稳定截图基线：登录桌面/移动、成长概览桌面/移动、职业路径桌面、记忆权限桌面；屏蔽动态用户名、时间和数量，关闭动画。
- [ ] 删除旧 Slate Panel/Button、旧 248px nav 和无引用 CSS；不要全局盲目替换所有 `slate-*`，只删除确认无引用内容。
- [ ] 运行密钥扫描：`npm.cmd run secret:scan`。
- [ ] 运行完整验收：`npm.cmd run verify`。
- [ ] 运行全部浏览器流程：`npm.cmd run test:e2e`。
- [ ] 使用真实本地数据手动走通：登录 → 聊天 → 成长概览 → 路径 → 训练 → 资源 → 记忆权限 → 退出。
- [ ] 确认 Git 只包含 UI、测试和计划范围文件，不包含 `.env.local`、数据库、截图和用户数据。
- [ ] 最终提交：`git commit -m "feat: unify CareerMate warm companion experience"`。

## 三、完成定义

只有同时满足以下条件才可向用户报告完成：

- [ ] 所有用户页面和登录页视觉同源，旧黑白 Slate 工作台不再出现。
- [ ] 聊天首页没有视觉或功能回退。
- [ ] 画像、计划、训练、资源、记忆、隐私和 Admin 原业务规则全部保留。
- [ ] 普通用户无法访问 Admin。
- [ ] 退出登录使用 POST 并确实清除会话。
- [ ] 348 个现有自动化测试、迁移冒烟、生产构建和全部 E2E 通过。
- [ ] 三种目标视口无横向滚动和遮挡。
- [ ] Claude 提供改造前后截图、测试输出和逐页验收清单，而不是只说“完成”。
