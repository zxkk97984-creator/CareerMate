# T08a 聚合画像/记忆/计划/V2 建议读模型及计数

日期：2026-09-06 · 基线：`e6c14d7` + 工作区（含 T01–T05）/ 当前 · 执行：T08a

## 1. 实现内容（plan 第 3.2 / T08a）

### `src/lib/suggestions.ts`（新增，核心读模型）
- `SuggestionRef` 判别联合：`{kind:'profile'|'plan'|'memory'|'artifact', id}`（plan 3.2 目标形状）。
- `SuggestionListItem`（轻量列表项：ref + title/status/createdAt/summary）。
- `SuggestionDetail` 判别联合（按 kind 提供各自 old/new 或对比）：
  - profile：`field / oldValue / newValue`
  - memory：`currentContent / suggestionText`
  - plan：`currentSummary / pendingSummary / diff?`
  - artifact：`candidateType / artifact`
  - 公共：`reason / evidenceSummary / impactSummary / source / baseVersion / status / title / ref`
- 四种来源的归一化：`normalizeProfileCandidate`（V1 画像）/ `normalizeMemory`（V1 记忆）/ `normalizePendingPlan`（pending 计划）/ `normalizeArtifact`（V2）。
- `buildSuggestionList(sources)`：**列表与计数同源**——只保留 `isProcessable`（pending），且以 `\`kind:id\`` 去重（仅端内去重，不按标题/时间猜测业务级去重）。返回 `{items, pendingCount}`。
- `loadSuggestionDetail(ref, loader)`：按 kind 分派，返回带类型的 `SuggestionDetailResult`（`{ok:false,status,message}` 供 UI 分类 401/404/409/501）。
- `isProcessable`：只有服务端 `pending` 才算可处理。

### `src/hooks/use-suggestions.ts`（新增，聚合读取）
- 并行拉取四种来源：`/api/profile/candidates`、`/api/memories`、`/api/plans/current`（取 pendingPlan）、`/api/agentic-v2/candidates?status=pending`。
- 用 `buildSuggestionList` 构建与计数同源的待确认列表；request sequence 防过时覆盖、卸载后不写状态。
- `loadDetail(ref)`：V2 走 `/api/agentic-v2/candidates/:id` 详情（含 artifact/baseVersion）；profile/memory 列表 payload 已含 old/new，详情在确认前内联展示。

## 2. 测试

`src/lib/suggestions.test.ts`（7 用例）：
- isProcessable 只认 pending。
- buildSuggestionList：四源归一化、只计可处理 pending（accepted 不计数/不入列表）、kind+id 去重、无 pending 返回 0。
- loadSuggestionDetail：按 kind 分派返回类型化 detail；无 loader 返回 501 失败；loader 失败透传 status/message（404“建议已不存在”）。

## 3. 修改文件

`src/lib/suggestions.ts`（新增）、`src/lib/suggestions.test.ts`（新增）、`src/hooks/use-suggestions.ts`（新增）。

## 4. 验证命令与结果

- `npm run test` → 126 文件 / 1106 用例全部通过（新增 suggestions 7 用例）。
- `npm run lint` → 0 error / 0 warning。
- `npx tsc --noEmit` → 通过。
- `npm run build` → exit 0。

## 5. 约定与边界（plan 第 0.7 / 第 2.1 / 第 3.2）

- 只做**读模型**；写接口仍按原协议（PATCH profile/candidates、POST memory/:id/decision、POST plans/:id/decision、POST agentic-v2/candidates/:id/decision），未合并成一个万能写接口。
- 候选计数与列表过滤同源；已接受/拒绝不计数；无关联证据不做业务级去重。
- `SuggestionRef` 用 `\`kind:id\`` 作 UI key，不暴露技术 ID 为主标题。

## 6. 未完成/后续

- 将读模型接入 MemoryView/画像/计划等展示处，并做“确认前必看变更、409/404/详情失败类型化 UI、请求防重复、接受/拒绝后只刷新受影响实体” —— 属 T08b（可理解的候选确认流程）。
- 浏览器级候选确认流程验收（老→新展示、双击只产生一次写入、已处理后不回 pending）留 T08b 浏览器轮次。
