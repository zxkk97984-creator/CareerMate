-- CreateTable
CREATE TABLE "AgentArtifactCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "candidateType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "artifact" TEXT NOT NULL,
    "baseVersion" INTEGER,
    "sourceSessionId" TEXT NOT NULL,
    "sourceConversationId" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentArtifactCandidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AgentArtifactCandidate_sourceConversationId_fkey" FOREIGN KEY ("sourceConversationId") REFERENCES "ChatConversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AgentArtifactCandidate_userId_status_createdAt_idx" ON "AgentArtifactCandidate"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AgentArtifactCandidate_sourceConversationId_idx" ON "AgentArtifactCandidate"("sourceConversationId");
