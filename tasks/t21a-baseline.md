# T21a 计划版本约束：历史盘点、冲突映射、迁移与并发测试

日期：2026-09-06 · 执行：agent · 对应提交：`f5208a6`

## 目标（plan T21a）

- CareerPlan 添加 userId+version 唯一约束。
- 先只读检查确认历史是否有重复，制定不删除用户数据的修复映射，再添加约束。
- 处理生成并发 / P2002，不静默丢计划、有恢复方式。
- 不直接套用 LearningRoute 的迁移。

## 变更

### `prisma/schema.prisma`
`CareerPlan` 添加 `@@unique([userId, version])`。

### `prisma/migrations/20260906180000_careerplan_unique_user_version/migration.sql`
两步迁移：
1. **先去重（不删数据）**：用窗口函数 `ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "version","createdAt","id")` 对每人重编号，保证 (userId, version) 唯一，同时保留 `parentPlanId`/`sourceReportId`/`learningRoutes` 等按 id 的关联不受影响。
2. 再 `CREATE UNIQUE INDEX "CareerPlan_userId_version_key"`。

（未直接复用 LearningRoute 迁移——本质不同，采用自建去重映射。）

### `src/lib/plans/generation-service.ts`
`ensureGenerationPlan` 在 `db.$transaction` 外层加有界重试（最多 3 次）：捕获唯一约束冲突 `P2002` 时（并发生成竞争），让出时间片后重试，下一轮重新读 `latest` 取下一版本；非 P2002 错误照常抛出。避免把“并发生成”误报为生成失败。

## 验证

| 项 | 命令 / 方式 | 结果 |
|---|---|---|
| 去重 SQL 逻辑 | node:sqlite 种子含重复 (u1:1,1,2 / u2:1,5) | u1→1,2,3；u2→1,2；唯一索引创建成功，无数据丢失 |
| 迁移 smoke | `npm run test:migrations` | 通过（fresh deploy/drift 与 legacy 保留/FK） |
| 类型检查 | `npx tsc --noEmit` | 通过（prisma generate 重生成） |
| 单测（generation） | `npx vitest run src/lib/plans/generation-service.test.ts` | 7/7（含 P2002 重试 + 非冲突不重试） |
| 全量 lint | `npm run lint` | 0/0 |
| 全量测试 | `npm run test` | 135 文件 / 1169 用例全绿 |
| 构建 | `npm run build` | exit 0 |

## 剩余风险 / 待验证

- 历史重复的实际存在需在真实副本上盘点（迁移脚本已具备去重能力）；有数据副本演练建议在真实部署副本上跑一次迁移确认无 P2002/异常。
- 唯一索引引入后，任何直接 `careerPlan.create` 写重复版本的路径都会报 P2002；应确认除 generation-service 外无其他写路径绕过。任务更新/候选确认的事务与冲突检测保留（未改动）。
