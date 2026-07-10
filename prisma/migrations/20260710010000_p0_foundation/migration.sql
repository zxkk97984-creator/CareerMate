CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "OnboardingConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "transcript" TEXT NOT NULL DEFAULT '[]',
    "draft" TEXT NOT NULL DEFAULT '{}',
    "completeness" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "requestedMode" TEXT NOT NULL DEFAULT 'mock',
    "actualMode" TEXT NOT NULL DEFAULT 'mock',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OnboardingConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "educationStage" TEXT NOT NULL,
    "major" TEXT,
    "targetRole" TEXT NOT NULL,
    "targetRoleLabel" TEXT NOT NULL,
    "weeklyAvailableHours" INTEGER NOT NULL,
    "learningPreference" TEXT NOT NULL DEFAULT '[]',
    "experienceSummary" TEXT NOT NULL DEFAULT '',
    "interestTags" TEXT NOT NULL DEFAULT '[]',
    "constraints" TEXT NOT NULL DEFAULT '[]',
    "abilityScores" TEXT NOT NULL DEFAULT '{}',
    "memoryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserProfile" ("abilityScores", "constraints", "createdAt", "educationStage", "experienceSummary", "id", "interestTags", "learningPreference", "major", "memoryEnabled", "targetRole", "targetRoleLabel", "updatedAt", "userId", "weeklyAvailableHours") SELECT "abilityScores", "constraints", "createdAt", "educationStage", "experienceSummary", "id", "interestTags", "learningPreference", "major", "memoryEnabled", "targetRole", "targetRoleLabel", "updatedAt", "userId", "weeklyAvailableHours" FROM "UserProfile";
DROP TABLE "UserProfile";
ALTER TABLE "new_UserProfile" RENAME TO "UserProfile";
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- Profiles that predate onboarding already contain complete seeded/user data.
UPDATE "UserProfile" SET "onboardingCompleted" = true;

CREATE TABLE "new_SimulationSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "scenarioKey" TEXT NOT NULL,
    "scenarioTitle" TEXT NOT NULL,
    "transcript" TEXT NOT NULL DEFAULT '[]',
    "score" INTEGER,
    "feedback" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'completed',
    "turnCount" INTEGER NOT NULL DEFAULT 0,
    "requestedMode" TEXT NOT NULL DEFAULT 'mock',
    "actualMode" TEXT NOT NULL DEFAULT 'mock',
    "candidateId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SimulationSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SimulationSession_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ProfileUpdateCandidate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SimulationSession" ("createdAt", "feedback", "id", "scenarioKey", "scenarioTitle", "score", "status", "transcript", "updatedAt", "userId") SELECT "createdAt", "feedback", "id", "scenarioKey", "scenarioTitle", "score", "status", "transcript", "updatedAt", "userId" FROM "SimulationSession";
DROP TABLE "SimulationSession";
ALTER TABLE "new_SimulationSession" RENAME TO "SimulationSession";
CREATE UNIQUE INDEX "SimulationSession_candidateId_key" ON "SimulationSession"("candidateId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE INDEX "OnboardingConversation_userId_status_idx" ON "OnboardingConversation"("userId", "status");
