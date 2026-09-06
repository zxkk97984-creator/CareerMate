# T17a 选择/训练/完成三阶段，刷新与失败恢复

日期：2026-09-06 · 执行：agent

## 目标（plan 4.3 模拟训练 / T17a）

- 依第 4.3 节组织“选择 → 训练 → 完成”三阶段流程。
- active 会话的 brief 与其场景对应，不能拿默认第一项冒充。
- 进入已有训练直接看到当前回合；重复 start/send/complete 有防护。
- API 失败答案保留，评分失败可重试；刷新后恢复当前 session。
- 接口未新增，request 用统一客户端（T03）。

## 变更

### 修改 `src/features/simulation/simulation-view.tsx`
- 删除 `request()` 裸 fetch 封装，改为 `fetchApi`（`/api/simulations`、`/api/simulations/:id/messages`、`/api/simulations/:id/complete`、`/api/simulations/scenarios`）。
- **选择阶段**：无进行中会话时展示场景列表 + 情境卡 + “开始新训练”。
- **训练阶段**（`active.status === "active"`）：
  - 不显示大片禁用场景卡片（左侧改为“当前正在训练…结束当前训练后选择”），聚焦当前训练与“继续回答”。
  - 情境卡默认折叠（`<details open={active?.status !== "active"}`），并展示当前会话对应场景。
  - 顶端“直接看到当前回合”（transcript + 输入框 + 提交/完成按钮）。
  - **brief 与会话场景对应**：`scoreBriefScenario` 取 `activeScenario = scenarioMetaForSession(active, scenarios)`，即从该 session 的 scenarioKey 反查元信息；找不到则降级显示“该场景详情暂不可用”，不拿默认第一项冒充。
- **完成阶段**：`active.status !== "active"` 时展示完成态（有 score 渲染报告，无 score 显示“本次未产生正式评分”）。
- **失败恢复**：
  - `send` 失败：`answer` 未清空（`setAnswer("")` 仅在成功分支），保留答案 + `sim-error` 就地提示，可重试。
  - `complete` 失败：保持 `active.status==="active"` 不变（成功才 `setActive`），按钮保留，可重试当前评分；不卸载页面。
- **重复防护**：`start`/`send`/`complete` 开头均有 `if (busy || …) return` 防双击；`complete` 加 `active.status !== "active"` 防重复完成。
- **刷新恢复**：`useEffect` 在 `active` 为空时从 `simulations` 找 `status==="active"` 恢复。
- 按钮文案改“**刷新推荐场景**”并与实际行为一致（plan 4.3：不写 AI 生成）。

### 修改 `src/lib/simulation.ts`
新增纯函数 `scenarioMetaForSession(session, available)`：从 session.scenarioKey 在可用场景数组中定位其元信息；无 key / 找不到返回 null（调用方降级，不冒充第一项）。

### 修改 `src/lib/simulation.test.ts`
新增 3 用例：按 scenarioKey 映射回自身场景（且非列表第一项）、目标不在可用列表返回 null、无 scenarioKey 返回 null。

## 验证

| 项 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npx tsc --noEmit` | 通过 |
| 单测（simulation） | `npx vitest run src/lib/simulation.test.ts` | 10/10 通过 |
| 改动文件 lint | `npx eslint` 3 文件 | 0 问题 |
| 全量 lint | `npm run lint` | 0/0 |
| 全量测试 | `npm run test` | 133 文件 / 1157 用例全绿 |
| 构建 | `npm run build` | exit 0 |

## 剩余风险

- 节点环境无真实浏览器：三轮评分流程、失败恢复、竞态的浏览器/E2E 检查留 T19/T25。
- 报告评分细节（null score 环、负向建议 `+-2`、候选直达详情）属 T17b，本次聚焦流程。
