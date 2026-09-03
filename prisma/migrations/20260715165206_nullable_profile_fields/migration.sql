-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "educationStage" TEXT,
    "major" TEXT,
    "targetRole" TEXT,
    "targetRoleLabel" TEXT,
    "weeklyAvailableHours" INTEGER,
    "learningPreference" TEXT NOT NULL DEFAULT '[]',
    "experienceSummary" TEXT NOT NULL DEFAULT '',
    "interestTags" TEXT NOT NULL DEFAULT '[]',
    "constraints" TEXT NOT NULL DEFAULT '[]',
    "abilityScores" TEXT NOT NULL DEFAULT '{}',
    "memoryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "introStatus" TEXT NOT NULL DEFAULT 'not_started',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserProfile" ("abilityScores", "constraints", "createdAt", "educationStage", "experienceSummary", "id", "interestTags", "introStatus", "learningPreference", "major", "memoryEnabled", "onboardingCompleted", "targetRole", "targetRoleLabel", "updatedAt", "userId", "version", "weeklyAvailableHours") SELECT "abilityScores", "constraints", "createdAt", "educationStage", "experienceSummary", "id", "interestTags", "introStatus", "learningPreference", "major", "memoryEnabled", "onboardingCompleted", "targetRole", "targetRoleLabel", "updatedAt", "userId", "version", "weeklyAvailableHours" FROM "UserProfile";
DROP TABLE "UserProfile";
ALTER TABLE "new_UserProfile" RENAME TO "UserProfile";
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
