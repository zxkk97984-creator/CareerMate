-- CreateTable
CREATE TABLE "OperationExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "opType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "OperationExecution_userId_operationId_idx" ON "OperationExecution"("userId", "operationId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationExecution_userId_conversationId_clientRequestId_operationId_key" ON "OperationExecution"("userId", "conversationId", "clientRequestId", "operationId");
