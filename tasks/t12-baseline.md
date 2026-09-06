# T12 参考分的可信表达与证据

日期：2026-09-06 · 基线：`e6c14d7` + 工作区（含 T01–T07/T08/T09/T10a/T11）/ 当前 · 执行：T12（T12a 命名/空值 + T12b 权重/解释/排序） · 对应提交：`b6eb4f6`

## 1. 修复内容（评估 F07 / plan 3.4）

### `src/lib/career.ts`
- 不改已保存能力；只改计算与表达。
- 新增 `normalizeWeights`：丢弃非有限/负数权重（NaN → 不输出 NaN），无有效权重返回 null（信息不足）。
- 新增 `calculateMatchScore`（纯函数）：
  - **缺失能力不兜底为 0**：某维度有岗位权重但无能力记录 → 计入 `unassessed`，“待评估”，不参与分数，也不参与猜排名。
  - **分数按有效权重归一化**：`score = Math.round(weightedSum / totalWeight)`，只对已记录维度求和；0 仅在真实记录为 0 时出现。
  - 全部无记录 → `score = null`（“信息不足”），不是臆造的 0。
  - 补弱优先级：`weight * (100 - value)` 排序（真实权重，不是按最低分猜）。
- `calculateMatch` 返回增加 `unassessed`、`breakdown`（维度明细：值/权重/gap）、`hasInsufficientData`；`score` 可为 null。
- **解释文案**改为“<岗位>成长参考分 X / 100（基于已记录能力和岗位权重，供学习安排参考；…）”，**不写“胜任概率”“匹配度 %”**。

### `src/lib/workspace-types.ts`
- `MatchData.score` 从 `number` 改为 `number | null`；新增 `unassessed`/`breakdown`/`hasInsufficientData`。

### `src/features/dashboard/dashboard-view.tsx`
- 标签从“岗位匹配度 · MATCH %”改为“成长参考分 · GROWTH SCORE /100”。
- `score == null` 显示“信息不足”+ 解释，不显示 0 分；`score != null` 才显示数字 + 解释。

## 2. 测试

`src/lib/career.test.ts`（7 用例）：normalizeWeights 丢弃非法/负权重并返回 null；加权分数；无记录维度视为未评估（不当作 0）；全部无记录 → null（不臆造 0）；补弱优先级按 `weight*(100-score)`（非最低分）；部分记录按有效权重归一化；非有限分不输出 NaN。

## 3. 验证命令与结果

- `npm run test` → 129 文件 / 1126 用例全部通过（新增 7；me 路由测试更新为新的 score/explanation 语义后仍绿）。
- `npm run lint` → 0 error / 0 warning。
- `npx tsc --noEmit` → 通过。
- `npm run build` → exit 0。

## 4. 修改文件

`src/lib/career.ts`、`src/lib/career.test.ts`（新增）、`src/lib/workspace-types.ts`、`src/features/dashboard/dashboard-view.tsx`。

## 5. 说明 / 环境受限

- 未改变任何已保存能力数据；仅计算/表达。
- “岗位匹配度”更名为“成长参考分 /100”；若未来要叫“岗位匹配度”，需另定义岗位目标阈值+评分模型+验证样本（plan 3.4，本轮不擅自改算法制造更高分）。
- 雷达图量纲固定 0–100、文本可读各维度来源/值、确认前不随候选上涨——雷达图展示了能力值（0–100），非分数；浏览器轮（T19）验证文本可读与信息不足样例。
