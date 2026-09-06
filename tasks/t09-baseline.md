# T09 生成计划到待确认再到正式执行的完整反馈

日期：2026-09-06 · 基线：`e6c14d7` + 工作区（含 T01–T05/T08a/T08b）/ 当前 · 执行：T09

## 1. 根因（对应评估 F05）

概览的 `generatePlan` 调用 `/api/plans/generate`，而该接口创建的是 **status: pending** 的候选计划（route.ts 第 67 行，返回 `pendingConfirmation: true`），不会立即生效。但 dashboard 却提示“职业路径已生成，当前月任务已刷新”——把候选当成了已应用。且概览不展示 pendingPlan，也不把它计入待确认数。

## 2. 改动

### `src/features/dashboard/dashboard-view.tsx`
- `generatePlan` 成功提示改为“新计划已准备好，确认后开始执行。”（不再谎称已刷新当前任务）；`generating` 开关已防重复点击，失败保留原计划与提示。
- 新增“待确认计划”横条：当 `data.pendingPlan` 存在时，显示“新计划待确认 · 确认后开始执行；当前任务保持不变”与“审阅计划”入口（跳 `/path`，接受逻辑在 path-view 的 `acceptPendingPlan`）。
- `pendingCandidateCount` 增加 `(data.pendingPlan ? 1 : 0)`，使概览“待确认”计数纳入 pending 计划。

### `src/components/workspace.tsx`
- 侧栏 `pendingCandidateCount` 同样纳入 `(data.pendingPlan ? 1 : 0)`，保持概览/路径/建议中心计数一致（plan 3.2：count 与列表同源）。
- 顺带把 `retryFatal` 的按钮从不存在 CSS 类 `cm-btn-primary` 改为内联样式（避免依赖未定义 class）。

## 3. 四步闭环（生成→待确认→接受→当前任务更新）

- 生成：dashboard `generatePlan` → 提示“新计划已准备好”，出现 pending 横条。
- 待确认：pending 横条 + `/path` 的 pending 预览（`PlanSummaryCard` + `acceptPendingPlan`）。
- 接受：`acceptPendingPlan` 调 `POST /api/plans/:id/decision`（已判断 `r.ok`，成功才提示，失败保留原计划），`refresh()` 后 `/api/plans/current` 更新为 active；
- 执行：dashboard 当前任务/参考分随 `data.plan` 更新（旧计划保留归档）。
- 已有 active 计划时新候选不替换当前任务；无 active 首次生成也有 pending 横条 + `/path` 确认入口。

## 4. 验证命令与结果

- `npx tsc --noEmit` → 通过。
- `npm run lint` → 0 error / 0 warning。
- `npm run test` → 126 文件 / 1106 用例全部通过。
- `npm run build` → exit 0（Compiled successfully）。

## 5. 修改文件

`src/features/dashboard/dashboard-view.tsx`、`src/components/workspace.tsx`。

## 6. 未浏览器验证项 / 说明

- 节点环境无浏览器，未做“概览生成 pending → 路径确认 → 接受 → 当前任务更新”的点击闭环；通过代码静态核对（generate 返回 pending、accept 判断 ok 并 refresh、pending 横条/计数纳入）+ 全量测试 + 构建佐证。
- 概览/路径/建议中心的 pending 计划计数与状态同步逻辑已统一；接受/拒绝后的刷新由现有 `refresh()`（背景刷新，不卸载视图，见 T04）完成。
- 页面布局/视觉细节（pending 横条样式、`/path` 预览、手机端表现）在 T11/T13 的前端轮次进一步收敛。
