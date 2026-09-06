# T21b 列表分页、总数语义与用户隔离

日期：2026-09-06 · 执行：agent · 对应提交：`a82a89b`

## 目标（plan T21b）

- 列表接口引入有上限的 limit 和稳定游标排序，客户端同步更改。
- UI count 不误用当前页长度冒充总数。
- 跨用户隔离。

## 变更

### `src/app/api/agentic-v2/candidates/route.ts`
- querySchema 增加 `limit`（`z.coerce.number().int().min(1).max(100)`，默认 50）与 `cursor`（稳定游标，按 `createdAt` 降序锚点）。
- `findMany` 取 `limit + 1` 判断是否还有下一页；`items` 截断到 limit；`nextCursor` 取本页最后一条 `createdAt`（无更多页时为 null）。
- 新增 `total = await count({ where })`（含 `userId: user.id` 隔离），用于真实总数。
- 响应由 `{ items }` 改为 `{ items, total, nextCursor }`。
- **用户隔离**：`where` 恒含 `userId: user.id`（原先已隔离，保留）。

### `src/lib/workspace-types.ts`
`WorkspaceData` 新增 `v2CandidateTotal: number`（与 `v2Candidates` 列表长度分离）。

### `src/hooks/use-workspace-data.ts`
- v2Candidates 请求类型含 `total`，URL 加 `&limit=100`。
- `applyIfOk` 同时写入 `v2CandidateTotal`（= `v.total ?? v.items.length` 兜底）。
- `emptyData()` 初始 `v2CandidateTotal: 0`。

### 计数语义
- `workspace.tsx` 与 `dashboard-view.tsx` 的待确认计数由 `(v2Candidates ?? []).length` 改为 `(v2CandidateTotal ?? list.length)`——**侧栏/概览计数用真实总数，不误用当前页长度**。

### `src/app/api/agentic-v2/candidates/route.test.ts`
mock 增加 `count`，新增/更新：total 来自 `count({ where: { userId } })` 且不受当前页长度影响；limit 超标返回 400；超一页时 nextCursor = last item createdAt；不足一页 nextCursor 为 null（共 10 用例）。

## 验证

| 项 | 命令 | 结果 |
|---|---|---|
| 单测（candidates route） | `npx vitest run src/app/api/agentic-v2/candidates/route.test.ts` | 10/10 |
| 类型检查 | `npx tsc --noEmit` | 通过 |
| 全量 lint | `npm run lint` | 0/0 |
| 全量测试 | `npm run test` | 135 文件 / 1173 用例全绿 |
| 构建 | `npm run build` | exit 0 |

## 剩余风险 / 待验证

- 分页为服务端契约更新 + “total 不误用页长”已修；客户端翻页（load more）UI 未实现——内存/候选列表在当前数据规模下由 `limit=100` 一次加载，无需分页按钮；若未来超大列表需 load-more，可接 `nextCursor`。
- memories/simulations 列表当前未加分页（数据通常较小）；如后续量级上升可套用同款 limit+cursor+total 模式。
- 跨用户隔离已在候选列表验证（route.test 用户隔离用例）；其他列表 API 均有 `userId` 过滤。
