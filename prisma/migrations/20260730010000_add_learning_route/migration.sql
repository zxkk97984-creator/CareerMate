-- CreateTable
CREATE TABLE "LearningRoute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "relatedPlanId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "content" TEXT NOT NULL DEFAULT '{}',
    "basePlanVersion" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LearningRoute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearningRoute_relatedPlanId_fkey" FOREIGN KEY ("relatedPlanId") REFERENCES "CareerPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LearningRoute_userId_status_idx" ON "LearningRoute"("userId", "status");

-- CreateIndex
CREATE INDEX "LearningRoute_relatedPlanId_idx" ON "LearningRoute"("relatedPlanId");
