-- 加法迁移：开放聊天状态、QuestionLedger、Plan V2
-- 只加不删，不删除历史数据

-- UserProfile: 新增 version 和 introStatus
ALTER TABLE "UserProfile" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "UserProfile" ADD COLUMN "introStatus" TEXT NOT NULL DEFAULT 'not_started';

-- RoleTemplate: 新增 aliases
ALTER TABLE "RoleTemplate" ADD COLUMN "aliases" TEXT NOT NULL DEFAULT '[]';

-- ChatConversation: 新增状态管理字段
ALTER TABLE "ChatConversation" ADD COLUMN "state" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "ChatConversation" ADD COLUMN "contextVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ChatConversation" ADD COLUMN "activeTurnId" TEXT;
ALTER TABLE "ChatConversation" ADD COLUMN "activeTurnStartedAt" DATETIME;
ALTER TABLE "ChatConversation" ADD COLUMN "summary" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ChatConversation" ADD COLUMN "lastSummarizedMessageId" TEXT;
ALTER TABLE "ChatConversation" ADD COLUMN "remoteContextVersion" INTEGER;

-- ChatMessage: 新增 turnId、clientRequestId 和约束
ALTER TABLE "ChatMessage" ADD COLUMN "turnId" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "clientRequestId" TEXT;

-- QuestionLedger: 新表
CREATE TABLE "QuestionLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "normalizedQuestionKey" TEXT NOT NULL,
    "profileVersion" INTEGER NOT NULL,
    "questionText" TEXT NOT NULL,
    "profileField" TEXT,
    "status" TEXT NOT NULL,
    "answerSummary" TEXT NOT NULL DEFAULT '',
    "askedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestionLedger_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ProfileUpdateCandidate: 新增 patch、baseProfileVersion、resolvedAt
ALTER TABLE "ProfileUpdateCandidate" ADD COLUMN "patch" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "ProfileUpdateCandidate" ADD COLUMN "baseProfileVersion" INTEGER;
ALTER TABLE "ProfileUpdateCandidate" ADD COLUMN "resolvedAt" DATETIME;

-- MemoryItem: 新增分类与来源字段
ALTER TABLE "MemoryItem" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'career_fact';
ALTER TABLE "MemoryItem" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'career';
ALTER TABLE "MemoryItem" ADD COLUMN "confidence" REAL;
ALTER TABLE "MemoryItem" ADD COLUMN "reason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MemoryItem" ADD COLUMN "sourceConversationId" TEXT;
ALTER TABLE "MemoryItem" ADD COLUMN "sourceMessageId" TEXT;
ALTER TABLE "MemoryItem" ADD COLUMN "expiresAt" DATETIME;

-- CareerPlan: 新增 V2 字段（保留所有旧列）
ALTER TABLE "CareerPlan" ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CareerPlan" ADD COLUMN "content" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "CareerPlan" ADD COLUMN "targetRoleLabel" TEXT;
ALTER TABLE "CareerPlan" ADD COLUMN "parentPlanId" TEXT;
ALTER TABLE "CareerPlan" ADD COLUMN "activatedAt" DATETIME;

-- 索引：QuestionLedger
CREATE UNIQUE INDEX "QuestionLedger_conversationId_normalizedQuestionKey_profileVersion_key"
    ON "QuestionLedger"("conversationId", "normalizedQuestionKey", "profileVersion");
CREATE INDEX "QuestionLedger_conversationId_status_idx"
    ON "QuestionLedger"("conversationId", "status");

-- 索引：ChatMessage
CREATE UNIQUE INDEX "ChatMessage_conversationId_clientRequestId_role_key"
    ON "ChatMessage"("conversationId", "clientRequestId", "role");
CREATE INDEX "ChatMessage_conversationId_turnId_idx"
    ON "ChatMessage"("conversationId", "turnId");

-- 索引：CareerPlan
CREATE INDEX "CareerPlan_parentPlanId_idx" ON "CareerPlan"("parentPlanId");
