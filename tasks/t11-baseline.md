# T11 行动优先概览与确定性下一步选择

日期：2026-09-06 · 基线：`e6c14d7` + 工作区（含 T01–T07/T08/T09/T10a）/ 当前 · 执行：T11

## 1. 实现内容

### `src/lib/next-action.ts`（新增，纯函数）
`selectNextAction(input)` 严格按 plan 3.3 顺序、确定性返回 `NextAction` 判别联合：
1. 画像未完整 → `onboarding`（去引导）。
2. 无 active 计划但有 pending → `review_pending_plan`（审阅计划）。
3. 无计划 → `generate_first_plan`（生成首个计划）。
4. 有进行中任务 → `continue_task`（继续该任务，href `/path#task-<id>`）。
5. 有延期任务 → `review_delayed`（查看延期并调整）。
6. 其他未完成任务 → `next_task`（按 dueWeek、原始顺序选第一项）。
7. 全完成/无可推进 → `review_period`（复盘/下一阶段）。

排序确定性：`in_progress > delayed > not_started > done`；同级按 dueWeek、再按原始顺序。**不随机**。

### `src/features/dashboard/dashboard-view.tsx`
- 顶部新增“下一步”主区：状态短标签 + 任务标题 + 推荐原因 + 一个主按钮（跳路径详情/引导），由 `selectNextAction` 决定。
- **删除虚构百分比**：移除 `statusProgress`（15%/60%/40%）与 `statusBarColor` 死代码；任务行不再画按 status 猜的进度条。
- **真实进度**：`本期已完成 X/Y`（completed/total）；`本月任务` 指标显示总任务数。
- 任务行可点击跳转 `/path#task-<id>`（明确可点击入口），保留状态标签（不只是颜色表达）。

## 2. 测试

`src/lib/next-action.test.ts`（8 用例）覆盖所有分支：画像→引导、pending→审阅、无计划→生成、进行中→继续、延期→查看、未开始→按 dueWeek/原始顺序第一项、同级确定性、全完成→复盘。

## 3. 验证命令与结果

- `npm run test` → 128 文件 / 1119 用例全部通过（新增 8）。
- `npm run lint` → 0 error / 0 warning。
- `npx tsc --noEmit` → 通过。
- `npm run build` → exit 0。

## 4. 修改文件

`src/lib/next-action.ts`（新增）、`src/lib/next-action.test.ts`（新增）、`src/features/dashboard/dashboard-view.tsx`。

## 5. 说明 / 环境受限

- 计划任务“从 dueWeek 推断真实日历到期日”不做——只写“第 N 周”（plan 3.3：不能从 dueWeek 推断真实到期日）。
- 手机首屏主动作、390/1440 布局、真实点击验证需浏览器，留 T19/T25；本任务以纯函数单测（全分支）+ 全量测试 + 构建佐证。
