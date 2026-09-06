-- T24：业务事件去重。为 ProgressLog 增加可空 dedupeKey，并对其建 userId+dedupeKey 唯一索引。
-- SQLite 唯一索引允许多个 NULL，故未设置去重键的历史行不受影响，仅对提供 dedupeKey 的业务事件去重。
ALTER TABLE "ProgressLog" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "ProgressLog_userId_dedupeKey_key" ON "ProgressLog"("userId", "dedupeKey");
