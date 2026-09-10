ALTER TABLE "SimulationSession" ADD COLUMN "conversationId" TEXT REFERENCES "ChatConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SimulationSession" ADD COLUMN "creationRequestId" TEXT;
CREATE UNIQUE INDEX "SimulationSession_conversationId_key" ON "SimulationSession"("conversationId");
CREATE UNIQUE INDEX "SimulationSession_userId_creationRequestId_key" ON "SimulationSession"("userId", "creationRequestId");
