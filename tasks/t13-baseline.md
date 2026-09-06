# T13 当前计划与待确认版本分开

日期：2026-09-06 · 基线：`e6c14d7` + 工作区（含 T01–T12）/ 当前 · 执行：T13

## 1. 根因（评估 F08）

`path-view.tsx` 原来：
```ts
const timelinePlan = pendingPlan ?? plan;
```
当存在 pending 计划时，时间线用了 `pendingPlan`，但版本号/当前月/假设仍用 `plan`（active），导致**同一视图内任务/时间线/假设来自不同版本**，跨版本阅读混淆。pending 计划只应作独立预览，不应替换主线时间线。

## 2. 改动（`src/features/path/path-view.tsx`）

- `timelinePlan` 改为恒等于 `plan`（active），所有任务/时间线/假设/版本号来自**同一个 activePlan**（plan 2.1 / T13）。
- pending 计划仍由 `PlanSummaryCard` 独立预览（不混入主线时间线），并在其上方标注“当前执行 vN · 建议 vN+1（确认后执行，旧版本保留）”。
- 接受步骤仍走 `acceptPendingPlan`（`POST /api/plans/:id/decision`，已判断 `r.ok`），确认后 `refresh()`，`/api/plans/current` 更新为 active，旧版保留归档。
- 无可比版本（首个计划）时，`PlanSummaryCard` 走“首个计划”路径（对 V2 用 `parsePlanV2`，对 V1 用现有转换），不装作是“改动后的新版”。

## 3. 复用的现有约定

- 复用 `src/lib/tbox/plan.ts` 的 `mergeYearChunks`（V1 36 月转换）、`groupPlanTimeline`、`PlanSummaryCard`（V1/V2）、`updatePlanTaskStatus`。未新建第三套 V1/V2 计划转换。
- `plans/current` 返回 active + pending（status in generating/processing/pending/generation_failed），此处仅读模型，未改写接口。

## 4. 验证命令与结果

- `npm run test` → 129 文件 / 1126 用例全部通过。
- `npm run lint` → 0 error / 0 warning。
- `npx tsc --noEmit` → 通过。
- `npm run build` → exit 0。

## 5. 修改文件

`src/features/path/path-view.tsx`。

## 6. 说明 / 环境受限

- V1（36 月 years/quarters/months）时间线经 `groupPlanTimeline` 保留；V2（phases）计划主线时间线为空，由 `PlanSummaryCard` 展示 phases——V2 主线时间线展开属后续增强（T14 冲突或需独立 V2 视图），本轮专注“当前/pending 版本分离”这一 F08 缺陷。
- “确认后执行，旧版保留”“冲突不覆盖”由现有 `acceptPendingPlan` + decision 接口保证（409 走 `r.ok` 分支）。
- 浏览器“当前/pending/归档”三态截图留 T19 前端轮次。
