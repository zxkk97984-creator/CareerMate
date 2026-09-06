# T17b 评分与候选报告，null 分数与实际来源

日期：2026-09-06 · 执行：agent · 对应提交：`379c3f8`

## 目标（plan 4.3 模拟训练“完成” / T17b）

- 「完成」：分数或“未评分” → 证据摘录 → 一条主要改进 → 查看候选/返回任务。
- null score 不渲染 0 分圆环。
- 负向建议不渲染 `+-2`。
- 输出“候选已生成/待确认”，不声称已改画像。
- AI 降级结果旁持续标记、折叠原因（plan 4.4：“本次使用演示数据”）。

## 变更

### 修改 `src/lib/simulation.ts`
- `formatAbilityImpact(value)`：正值 `+N`、负值 `-N`（而非 `+-N`）、非有限值 `0`。
- `impactBarPercent(value)`：条形宽度按绝对值折算并截断到 `[0,100]`，负值只改符号不改长度。

### 修改 `src/features/simulation/simulation-view.tsx`
- `ScoreRing` 对 `null` 不再渲染 0 分圆环，改为「未产生正式评分」占位（`role="img" aria-label="本次训练未评分"`）。
- 完成态一律走 `SimulationReport`（含 null score），以呈现“分数或未评分 → 证据摘录 → 改进建议 → 候选/返回任务”。
- 能力影响条用 `impactBarPercent` 取绝对值、`formatAbilityImpact` 格式化；负值加 `.sim-impact-value-neg`（warning 色），不再出现 `+-2`。
- AI 降级（`actualMode === "mock"`）在报告顶部持续标记“本次使用演示数据（结果仅供参考）”，不折叠成“AI 生成”假象。
- 候选文案保持“画像候选已生成”“候选未确认前不视为已更新画像”，不声称已改画像；未生成候选时明确提示“本次未生成画像更新候选”。
- 报告操作区新增「返回任务」（`<Link href="/path">`），与「再来一次」并列。

### 修改 `src/app/globals.css`
新增 `.sim-report-score-none`、`.sim-impact-value-neg`、`.sim-report-degraded`、`.sim-report-back` 样式。

### 修改 `src/lib/simulation.test.ts`
新增 2 组共 4 用例：`formatAbilityImpact`（+N/-N/0/NaN）、`impactBarPercent`（正负同宽/NaN/超限截断）。

### 现有 `src/features/simulation/simulation-view.test.tsx`（3 用例）
保持并回归通过：无评分完成态不声称候选、有候选才宣称、候选确认引导；未删除任何断言。

## 验证

| 项 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npx tsc --noEmit` | 通过 |
| 单测（simulation） | `npx vitest run src/lib/simulation.test.ts` | 12/12 通过 |
| 单测（simulation-view） | `npx vitest run src/features/simulation/simulation-view.test.tsx` | 3/3 通过 |
| 改动文件 lint | `npx eslint` 4 文件 | 0 问题 |
| 全量 lint | `npm run lint` | 0/0 |
| 全量测试 | `npm run test` | 133 文件 / 1159 用例全绿 |
| 构建 | `npm run build` | exit 0 |

## 剩余风险

- 节点环境无真实浏览器：评分报告、降级标记、返回任务交互的浏览器验证留 T19/T25。
- 候选取向 `/memory` 为通用入口；若需逐候选深链，可随后续记忆/候选深链任务收敛。
