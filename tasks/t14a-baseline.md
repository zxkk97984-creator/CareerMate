# T14a 任务详情、真实完成标准与状态更新

日期：2026-09-06 · 基线：`e6c14d7` + 工作区（含 T01–T13）/ 当前 · 执行：T14a

## 1. 实现内容（plan 4.3 / T14a，仅用现有字段，不新增 schema）

### `src/lib/task-detail.ts`（新增，纯函数）
`buildTaskDetail({task, month})` 只读现有字段，得到 `TaskDetailView`：
- 单任务字段：`title / typeLabel / status / weekLabel（第 N 周）/ estimatedHours`。
- **缺值明确“待细化”**：单任务无独立 `steps/交付物/完成标准` 字段 → `steps: null`（前端渲染“让 AI 细化”），不臆造。
- **月份级交付物/完成标准**：来自 `month.practiceOutputs / evaluationMetrics`，标记 `sharedByMonth: true`，展示为“本阶段共同要求”，**不错误归属到某单任务**。
- 相对周次只写“第 N 周”，不从 `dueWeek` 推断真实日历到期日（plan 3.3）。
- `taskStatusLabel`：状态→中文文案，不新增枚举。

### `src/components/path/task-detail.tsx`（新增）
桌面右侧抽屉/手机全屏的任务详情：类型/状态/周次标签、预计投入、步骤、交付物（含“本阶段共同要求”标注）、完成标准，缺失项“让 AI 细化”；底部状态下拉（更新状态走现有 `PATCH /api/plans/:id/tasks/:taskId`，即复用 `updateTask`，带 pending/error 语义）。

### `src/features/path/path-view.tsx`
- 任务行改为可点击（打开详情抽屉），保留状态下拉。
- 新增 `selectedTaskId`/`selectedTask` 与 `TaskDetailPanel` 抽屉（选中时才显示，关闭回焦触发点）。
- 顺带修正时间线副标题：T13 改动后主线时间线来自 **activePlan**，不再是“待确认版本”，改为“当前执行版本的季度里程碑与月度目标”。

## 2. 测试

`src/lib/task-detail.test.ts`（5 用例）：读取真实字段并把缺失项标记为待细化；月份级交付物/标准标为共享（非单任务）；月份为空不臆造交付物；只写相对周次不推断真实日期；状态中文标签。

## 3. 复用

- 复用现有 `PATCH /api/plans/:id/tasks/:taskId`（`updatePlanTaskStatus`）做状态更新，未新增写接口。
- 复用现有 `currentMonth.learningTasks`/`practiceOutputs`/`evaluationMetrics` 真实数据，未在前端随机填值。
- 未新增数据库表/字段。

## 4. 验证命令与结果

- `npm run test` → 130 文件 / 1131 用例全部通过（新增 5）。
- `npm run lint` → 0 error / 0 warning。
- `npx tsc --noEmit` → 通过。
- `npm run build` → exit 0。

## 5. 修改文件

`src/lib/task-detail.ts`（新增）、`src/lib/task-detail.test.ts`（新增）、`src/components/path/task-detail.tsx`（新增）、`src/features/path/path-view.tsx`。

## 6. 未完成 / 说明

- 任务状态的 pending/success/error 提示由 `updateTask`（path-view 现有）处理；后台刷新（T04）不关闭详情。
- 直接链接 `/path#task-<id>`、刷新、手机关闭返回、归档状态可用的浏览器验证，留 T19/T25 浏览器轮次（URL 深链已由 `next-action`/任务行 href 支持）。
- 任务内容的充实（具体动词/交付物/标准）属 T14b 内容质量，本任务聚焦“用真实字段展示 + 缺失明确待细化 + 不误归属月份级要求”。
