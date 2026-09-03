-- CreateTable
CREATE TABLE "ChatConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "remoteConversationId" TEXT,
    "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChatConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "parts" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'completed',
    "executionMeta" TEXT NOT NULL DEFAULT '{}',
    "contextMeta" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AbilityEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "abilityKey" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceRef" TEXT,
    "confidence" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "observedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AbilityEvidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CareerExplorationReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "roleName" TEXT NOT NULL,
    "roleKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'exploratory',
    "content" TEXT NOT NULL DEFAULT '{}',
    "sources" TEXT NOT NULL DEFAULT '[]',
    "executionMeta" TEXT NOT NULL DEFAULT '{}',
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CareerExplorationReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CareerExplorationReport_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CareerPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "targetRole" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "years" TEXT NOT NULL DEFAULT '[]',
    "quarters" TEXT NOT NULL DEFAULT '[]',
    "months" TEXT NOT NULL DEFAULT '[]',
    "currentMonthIndex" INTEGER NOT NULL DEFAULT 1,
    "assumptions" TEXT NOT NULL DEFAULT '[]',
    "riskNotes" TEXT NOT NULL DEFAULT '[]',
    "generationMeta" TEXT NOT NULL DEFAULT '{}',
    "sourceReportId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CareerPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CareerPlan_sourceReportId_fkey" FOREIGN KEY ("sourceReportId") REFERENCES "CareerExplorationReport" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CareerPlan" ("assumptions", "createdAt", "currentMonthIndex", "id", "months", "quarters", "riskNotes", "status", "targetRole", "updatedAt", "userId", "version", "years") SELECT "assumptions", "createdAt", "currentMonthIndex", "id", "months", "quarters", "riskNotes", "status", "targetRole", "updatedAt", "userId", "version", "years" FROM "CareerPlan";
DROP TABLE "CareerPlan";
ALTER TABLE "new_CareerPlan" RENAME TO "CareerPlan";
CREATE INDEX "CareerPlan_sourceReportId_idx" ON "CareerPlan"("sourceReportId");
CREATE TABLE "new_ProfileUpdateCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT NOT NULL DEFAULT 'null',
    "newValue" TEXT NOT NULL DEFAULT 'null',
    "confidence" REAL NOT NULL,
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT NOT NULL,
    "sourceConversationId" TEXT,
    "evidenceExcerpt" TEXT NOT NULL DEFAULT '',
    "impactSummary" TEXT NOT NULL DEFAULT '',
    "abilityEvidenceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProfileUpdateCandidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProfileUpdateCandidate_sourceConversationId_fkey" FOREIGN KEY ("sourceConversationId") REFERENCES "ChatConversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProfileUpdateCandidate_abilityEvidenceId_fkey" FOREIGN KEY ("abilityEvidenceId") REFERENCES "AbilityEvidence" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ProfileUpdateCandidate" ("confidence", "createdAt", "field", "id", "newValue", "oldValue", "reason", "requiresConfirmation", "source", "status", "updatedAt", "userId") SELECT "confidence", "createdAt", "field", "id", "newValue", "oldValue", "reason", "requiresConfirmation", "source", "status", "updatedAt", "userId" FROM "ProfileUpdateCandidate";
DROP TABLE "ProfileUpdateCandidate";
ALTER TABLE "new_ProfileUpdateCandidate" RENAME TO "ProfileUpdateCandidate";
CREATE UNIQUE INDEX "ProfileUpdateCandidate_abilityEvidenceId_key" ON "ProfileUpdateCandidate"("abilityEvidenceId");
CREATE INDEX "ProfileUpdateCandidate_sourceConversationId_idx" ON "ProfileUpdateCandidate"("sourceConversationId");
CREATE TABLE "new_RoleDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roleKey" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewerId" TEXT,
    "sourceReportId" TEXT,
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoleDraft_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RoleDraft_sourceReportId_fkey" FOREIGN KEY ("sourceReportId") REFERENCES "CareerExplorationReport" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RoleDraft" ("category", "content", "createdAt", "id", "reviewNote", "reviewerId", "roleKey", "roleName", "status", "updatedAt") SELECT "category", "content", "createdAt", "id", "reviewNote", "reviewerId", "roleKey", "roleName", "status", "updatedAt" FROM "RoleDraft";
DROP TABLE "RoleDraft";
ALTER TABLE "new_RoleDraft" RENAME TO "RoleDraft";
CREATE UNIQUE INDEX "RoleDraft_sourceReportId_key" ON "RoleDraft"("sourceReportId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ChatConversation_userId_status_lastMessageAt_idx" ON "ChatConversation"("userId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AbilityEvidence_userId_abilityKey_status_idx" ON "AbilityEvidence"("userId", "abilityKey", "status");

-- CreateIndex
CREATE INDEX "CareerExplorationReport_userId_status_generatedAt_idx" ON "CareerExplorationReport"("userId", "status", "generatedAt");

-- CreateIndex
CREATE INDEX "CareerExplorationReport_conversationId_idx" ON "CareerExplorationReport"("conversationId");
