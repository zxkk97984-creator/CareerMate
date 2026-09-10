-- 模拟训练：保存开始时的场景、评分规则和来源快照；旧会话保持可读。
ALTER TABLE "SimulationSession" ADD COLUMN "scenarioSnapshot" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "SimulationSession" ADD COLUMN "scoringSnapshot" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "SimulationSession" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'recommended';
ALTER TABLE "SimulationSession" ADD COLUMN "sourceRef" TEXT;
ALTER TABLE "SimulationSession" ADD COLUMN "roundLimit" INTEGER NOT NULL DEFAULT 6;
ALTER TABLE "SimulationSession" ADD COLUMN "completedAt" DATETIME;
