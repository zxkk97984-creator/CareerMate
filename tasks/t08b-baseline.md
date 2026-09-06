# T08b 候选预览、确认、拒绝、版本冲突与结果同步

日期：2026-09-06 · 基线：`e6c14d7` + 工作区（含 T01–T05/T08a）/ 当前 · 执行：T08b

## 1. 修复内容（对应评估 F04 + plan 第 3.2 按钮规则）

### 根因
`memory-view.tsx` 原 `operate`：
```ts
async function operate(...){ await fetchApi(...); setNotice("画像更新已确认。"); await refresh(); }
```
**未判断 `r.ok` 就提示成功** —— 后端拒绝/冲突时仍显示“已确认”。且 V1 候选卡只展示 field/reason，不展示 old→new，用户无法判断自己接受了什么；V2 候选只按`decision`调用，失败也未归一化。

### 改动（`src/features/memory/memory-view.tsx`）
- 新增 `decisionMessage(status, code, fallback)`：409/`CONFLICT`→“资料已变化，这条建议需要重新生成”（禁止覆盖提交）；404→“这条建议已不存在”；401→“登录已过期”；其余 fallback。
- 新增 `decisionBusy` 状态：任一候选决策进行中禁用该卡操作，**避免双击重复写入**（E09）；被处理卡片进入终态。
- `operate`（V1）：`PATCH /api/profile/candidates` 后**检查 `r.ok`**，失败按 status/code 归一化提示，成功才提示并 `refresh()`。
- 新增 `operateV2`：`POST /api/agentic-v2/candidates/:id/decision`，同样检查 ok、防重复、409/404 归一化（替代原内联且未归一化的 onClick）。
- **确认前必看变更**：V1 候选卡在待确认时展示“当前值 → 建议值”（`oldValue → newValue`，空值显示“未设置”），不再盲确认。
- 顺带修复同文件 `confirmDelete`（记忆删除）未判断 `r.ok` 就提示成功的问题（同类 F04 缺陷）。

### 读模型复用
沿用 T08a 的 `SuggestionDetailResult`/`suggestions.ts` 语义（详情按 kind、状态以服务端为准）；写接口保持原协议（未合并万能写接口）。

## 2. 未在 T08b 范围 / 说明

- `ProfileCandidateCard` / `AgentArtifactCandidateCard`（被 `message-parts.tsx` 使用）已具备 old→new 展示；`message-parts.tsx` 为另一 agent 的未提交 WIP，本轮**未触碰**，避免破坏其 chat 重构。
- 计划接受/拒绝（`POST /api/plans/:id/decision`）与“生成→待确认→接受→当前任务更新”闭环属于 T09；本轮聚焦 V1 画像候选 + V2 记忆/候选人确认。
- 记忆关闭语义、隐私/导出/清空的危险区放在页底、`ConfirmDialog` 异步等待结果后才关闭等属于 T18，本轮仅修 `confirmDelete` 的 ok 判断。

## 3. 验证命令与结果

- `npm run test` → 126 文件 / 1106 用例全部通过。
- `npm run lint` → 0 error / 0 warning。
- `npx tsc --noEmit` → 通过。
- `npm run build` → exit 0。

## 4. 修改文件

`src/features/memory/memory-view.tsx`。

## 5. 未浏览器验证项（环境受限，记录）

- 节点环境无浏览器，未做“接受/拒绝/冲突”的浏览器点击流程与隔离数据库断言；409 不覆盖新数据、双击只一次写入、已处理后不回 pending 等通过代码静态核对与全量测试佐证。
- 浏览器级候选确认流程（E08/E09）留待 T19/T25 的浏览器轮次。
