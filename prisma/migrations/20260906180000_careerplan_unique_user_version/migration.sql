-- CareerPlan 需要 userId+version 唯一约束（T21a）。
-- 先只读修复历史重复，再建唯一索引，不删除任何用户的计划数据。
-- 对每个用户按 (version, createdAt, id) 顺序重新编号，保证 (userId, version) 唯一，
-- 同时保留 parentPlanId/sourceReportId/learningRoutes 等按 id 的关联不受影响。

WITH ranked AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "userId"
           ORDER BY "version", "createdAt", "id"
         ) AS new_version
  FROM "CareerPlan"
)
UPDATE "CareerPlan"
SET "version" = (SELECT new_version FROM ranked WHERE ranked."id" = "CareerPlan"."id");

-- 添加 userId + version 唯一约束
CREATE UNIQUE INDEX "CareerPlan_userId_version_key" ON "CareerPlan"("userId", "version");
