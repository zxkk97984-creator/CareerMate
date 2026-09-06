# T14b 近期任务内容质量、时间预算和历史兼容

日期：2026-09-06 · 基线：`e6c14d7` + 工作区（含 T01–T14a）/ 当前 · 执行：T14b · 对应提交：`22de1fd`

## 1. 实现内容

### `src/lib/plan-budget.ts`（新增，纯函数，可单测）
- `calculatePlanBudget(tasks, weeklyBudgetHours)`：
  - 只统计**近期 1–4 周**有明确 `estimatedHours` 的任务（不把远期里程碑误算进本周预算）。
  - `weeklyHours = totalNearTermHours / 4`（近期任务按 4 周分布估算）。
  - **超出预算 → `ok:false` 并给解释**（“近期任务预计每周约 X 小时，超过你设置的每周 Y 小时，建议精简或延后”），**不偷偷超预算**；未设置预算/0/无近期任务均合法并解释。
- `assessTaskConcreteness(title)`：
  - 识别“完成核心材料/沉淀小产出/提升能力/了解基础……”等**无动作对象泛词**（`vague:true` + 建议改写）。
  - 认可用具体动词 + 可检查交付物的任务（“选 2 个 X…交付一页比较表”“写出 3 个真实测试案例…清单”）。

### 与计划/生成的关系
- 这是**质量校验层**：供计划生成/展示前后校验近期任务是否具体、预算是否合理。**未改写历史 V1/V2 计划**（plan 3.2：新 Schema 不自动重写已有计划）；历史 V1/V2 读取不报错——校验函数是只读的，接受已有 task 结构（V1 `PlanTask`、V2 `PlanTask90` 的 `estimatedHours` 可选）。

## 2. 测试

`src/lib/plan-budget.test.ts`（8 用例）：近期求和并按周摊、远期里程碑不计入、预算超支被标记不静默、无明确小时数不计入、dueWeek>4 不算近期、未设预算合法、泛词识别、具体任务通过、空标题视为泛词。

## 3. 验证命令与结果

- `npm run test` → 131 文件 / 1139 用例全部通过（新增 8）。
- `npm run lint` → 0 error / 0 warning。
- `npx tsc --noEmit` → 通过。
- `npm run build` → exit 0。

## 4. 修改文件

`src/lib/plan-budget.ts`（新增）、`src/lib/plan-budget.test.ts`（新增）。

## 5. 说明 / 环境受限

- 内容质量（近期任务具体动词/时长/交付物/标准）最终取决于生成计划时 AI 输出；本任务落地的是**可校验的纯函数**（预算 + 具体性），供生成/展示先后校验，而不在 UI 伪造内容。
- 模拟样例为 mock/manual 时应有“演示数据/人工样例”标识 —— 该标识由 `AiExecutionMeta.source`（T03 契约）承载，已在结果旁展示；浏览器轮（T19/T25）验证样例标识与人工抽查 3 岗位样例。
- 未给单任务新增独立交付物/标准字段；需要时可走“版本化 JSON 扩展 + parser/DTO/投影/fixture/测试”步骤，属后续按需（plan 2.3），本任务先提供校验函数，不先行改库。
