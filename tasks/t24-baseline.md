# T24 去重业务事件、脱敏诊断与模式分离的运行记录

日期：2026-09-06 · 执行：agent · 对应提交：`49b56d6`

## 目标（plan T24）

- 区分业务事件与技术日志；业务激活从已有确认/任务/训练记录推导，缺失事件才加。
- 技术记录含 requestId、operation、elapsedMs、mode、degraded、errorCode，不记录敏感正文。
- 事件不重复计数。
- AI 延迟/降级率与 mock 分开；隐私清空/导出覆盖新增数据。
- 首轮用本地 JSON/CSV 汇总，不先造运营后台。

## 变更

### 新增 `src/lib/diagnostics.ts`（脱敏诊断 + 模式分离）
- `DiagnosticEntry`：`requestId/operation/elapsedMs/mode/degraded/errorCode/source/dedupeKey`，无敏感正文字段。
- `redactForDiagnostics(value)`：递归删除 `password/token/secret/message/content/transcript/body/chat/...` 等敏感键，截断 >500 字字符串——防御性脱敏。
- `toDiagnosticLine(entry)`：单行 JSONL。
- `isMock(mode)`：api 与 mock/manual 分开——便于分别统计真实 AI 延迟/降级率。
- `logDiagnostic(entry)`：按 mode 落到 `.diagnostics/diagnostics.jsonl` 或 `diagnostics.mock.jsonl`；`dedupeKey` 进程内去重避免重复计数；写入失败静默降级不阻断主流程。

### 新增 `src/lib/diagnostics.test.ts`
5 用例：敏感键删除（含嵌套）、超长字符串截断、单行 JSONL 无正文、mode 分离、errorCode 可追溯。

### `prisma/schema.prisma` + 迁移 `20260906200000_progresslog_dedupe_key`
`ProgressLog` 加可空 `dedupeKey` + `@@unique([userId, dedupeKey])`；SQLite 唯一索引允许多 NULL，未设键的历史行不受影响，仅对提供 dedupeKey 的业务事件去重（事件不重复计数）。

### `src/lib/agentic-v2/candidate-resolution.ts`
`applyProjection` 新增 `candidateId` 参数；`learning_route_accepted` 的 ProgressLog 写入 `dedupeKey: accept:{type}:{candidateId}`——同一候选重复确认不重复计数。

## 验证

| 项 | 命令 | 结果 |
|---|---|---|
| 单测（diagnostics） | `npx vitest run src/lib/diagnostics.test.ts` | 5/5 |
| 单测（candidate-resolution） | `npx vitest run …candidate-resolution.test.ts` | 10/10 通过（dedupe 未破坏） |
| 迁移 smoke | `npm run test:migrations` | 通过（fresh/drift/legacy/FK） |
| 类型检查 | `npx tsc --noEmit` | 通过（prisma generate 重生成） |
| 全量 lint | `npm run lint` | 0/0 |
| 全量测试 | `npm run test` | 140 文件 / 1196 用例全绿 |
| 构建 | `npm run build` | exit 0 |

## 剩余风险 / 待验证

- 诊断日志为本地 JSONL 追加；未建运营后台（符合 plan“不先造后台”）。去重为进程内 Set + 数据库唯一约束双重保障。
- 隐私清空/导出对新增 `dedupeKey`/诊断 `.diagnostics` 目录的覆盖：`/api/privacy/account-data` 未改（诊断目录不在用户隐私数据内，为运行元信息）；如需随清空一并删除诊断可后续接入。
- 其他业务事件（计划生成、任务完成、训练完成）去重键未逐个接入；本次以候选接受路径为示例接入 `dedupeKey` 模式，可推广到其余事件。
- 一条失败从 UI requestId 对应到服务日志：诊断记录含 requestId/errorCode，已具备对应基础；具体 UI→日志联调留 T25。
