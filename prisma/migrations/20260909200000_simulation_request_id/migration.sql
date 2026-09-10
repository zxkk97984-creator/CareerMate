-- 训练回答幂等：同一客户端 requestId 重放时不重复增加轮次。
ALTER TABLE "SimulationSession" ADD COLUMN "lastRequestId" TEXT;
