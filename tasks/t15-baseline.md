# T15 展示已确认 LearningRoute 及关联版本

日期：2026-09-06 · 执行：agent · 对应提交：`ce44263`

## 目标（plan 3.5 / 4.3 “学习安排”）

“学习安排”不再把 `learningRoute.content`（`z.unknown` 数组）直接渲染。用显式展示 adapter 投影：
- 与关联计划版本并列展示（目标岗位、周期、每周预算、阶段、任务、交付物、验收标准）。
- 关联的是归档计划时提示“需复盘，不自动迁移”。
- 内容为空、损坏、形状未知时降级说明，不抛异常、不渲染裸数组、不虚构空行。

## 变更

### 新增 `src/lib/learning-route.ts`
纯函数展示 adapter `toLearningRouteView(content, relatedPlan, basePlanVersion)`：
- `content` 非对象（损坏 JSON / 空）→ `present:false` + degraded“暂无法解析”。
- `asStages` 逐项校验，`{title,name,phase}` 任一取 title，坏项丢弃而非抛错。
- `weeklyBudgetHours` 仅正数才保留。
- 内容为空（stages/tasks/deliverables/acceptanceCriteria 全空）→ degraded“暂无已确认”。
- `toRelatedPlan` 依据 `status==="archived"` 置 `archived` 标志（→ 复盘提示，不自动迁移）。

返回类型 `LearningRouteView`（判别字段 `present`），`relatedPlan` 投射为 `RelatedPlanView`。

### 新增 `src/lib/learning-route.test.ts`
6 用例：合法形状解析、非对象降级、归档关联计划标记、空内容降级、未知阶段形状容错、weeklyBudgetHours 正数校验。

### 新增 `src/components/path/learning-route-view.tsx`
`LearningRouteDisplay`（接 adapter）+ `LearningRouteViewBody`（投影渲染）。
- 关联计划行：角色 + vN + “本路线基于计划 vN”（basePlanVersion 可能为数组，用 “、” 连接）。
- 归档时追加“（关联的是已归档计划，需复盘，不自动迁移）”。
- `view.degraded` 追加展示为警告色。

### 修改 `src/features/path/path-view.tsx`
- 新增 `learningRoute` state + `useEffect` 按需读 `/api/learning-routes/current`（`active` 守卫防卸载后写状态）。
- 主视图新增“学习安排”区块，渲染 `<LearningRouteDisplay>`；未确认时显示占位文案。
- 区块置于“假设与风险”之后、任务详情抽屉之前。

## 验证

| 项 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npx tsc --noEmit` | 通过 |
| 单测（learning-route） | `npx vitest run src/lib/learning-route.test.ts` | 6/6 通过 |
| 改动文件 lint | `npx eslint` 4 文件 | 0 问题 |
| 全量 lint | `npm run lint` | 0/0 |
| 全量测试 | `npm run test` | 132 文件 / 1145 用例全绿 |
| 构建 | `npm run build` | exit 0 |

## 剩余风险

- 节点环境无真实浏览器：“学习安排”空态/正常/归档三态视觉与 `/api/learning-routes/current` 接口联调留待 T19/T25。
- `message-parts.tsx` 属另一 agent 未提交 WIP，本次未触碰、未纳入提交。
