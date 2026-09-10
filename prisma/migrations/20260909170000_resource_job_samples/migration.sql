-- 增量补齐学习资源详情字段，并新增本地岗位样本表。
-- 不删除、不清空现有 ResourceItem；旧记录保持可读。
ALTER TABLE "ResourceItem" ADD COLUMN "externalKey" TEXT;
ALTER TABLE "ResourceItem" ADD COLUMN "provider" TEXT;
ALTER TABLE "ResourceItem" ADD COLUMN "difficulty" TEXT;
ALTER TABLE "ResourceItem" ADD COLUMN "detail" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ResourceItem" ADD COLUMN "steps" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ResourceItem" ADD COLUMN "deliverables" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ResourceItem" ADD COLUMN "acceptanceCriteria" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ResourceItem" ADD COLUMN "verificationStatus" TEXT NOT NULL DEFAULT 'unverified';
ALTER TABLE "ResourceItem" ADD COLUMN "lastVerifiedAt" DATETIME;
ALTER TABLE "ResourceItem" ADD COLUMN "validUntil" DATETIME;
ALTER TABLE "ResourceItem" ADD COLUMN "sourceFile" TEXT;
ALTER TABLE "ResourceItem" ADD COLUMN "sourceBatch" TEXT;
ALTER TABLE "ResourceItem" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "ResourceItem" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
-- SQLite 不允许 ALTER TABLE 增加 CURRENT_TIMESTAMP 非恒定默认值；
-- 旧记录先置为 NULL，Prisma @updatedAt 会在后续写入时维护。
ALTER TABLE "ResourceItem" ADD COLUMN "updatedAt" DATETIME;

CREATE UNIQUE INDEX "ResourceItem_externalKey_key" ON "ResourceItem"("externalKey");
CREATE INDEX "ResourceItem_roleKey_abilityKey_status_idx" ON "ResourceItem"("roleKey", "abilityKey", "status");
CREATE INDEX "ResourceItem_verificationStatus_idx" ON "ResourceItem"("verificationStatus");

CREATE TABLE "JobSample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "roleKey" TEXT,
    "title" TEXT NOT NULL,
    "company" TEXT,
    "city" TEXT NOT NULL,
    "experience" TEXT,
    "education" TEXT,
    "salaryRaw" TEXT NOT NULL DEFAULT '',
    "salaryMin" REAL,
    "salaryMax" REAL,
    "salaryUnit" TEXT,
    "salaryMonths" INTEGER,
    "salaryComparable" BOOLEAN NOT NULL DEFAULT false,
    "salaryNote" TEXT NOT NULL DEFAULT '',
    "skills" TEXT NOT NULL DEFAULT '[]',
    "jobLink" TEXT,
    "jd" TEXT NOT NULL DEFAULT '',
    "sourceFile" TEXT NOT NULL,
    "sourceBatch" TEXT NOT NULL,
    "collectedAt" DATETIME,
    "collectionDateApprox" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
    "detailAvailable" BOOLEAN NOT NULL DEFAULT false,
    "fieldConflicts" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "JobSample_jobId_key" ON "JobSample"("jobId");
CREATE INDEX "JobSample_city_title_idx" ON "JobSample"("city", "title");
CREATE INDEX "JobSample_experience_idx" ON "JobSample"("experience");
CREATE INDEX "JobSample_education_idx" ON "JobSample"("education");
CREATE INDEX "JobSample_roleKey_idx" ON "JobSample"("roleKey");
