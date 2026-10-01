import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const directory = mkdtempSync(join(tmpdir(), "careermate-review-test-"));
const database = join(directory, "review.db");
writeFileSync(database, "");
const url = `file:${database.replaceAll("\\", "/")}`;
const env = { ...process.env, DATABASE_URL: url, NODE_ENV: "production" };
const prisma = new PrismaClient({ datasources: { db: { url } } });
const jobCatalog = JSON.parse(readFileSync("data/jobs/review-job-samples.json", "utf8"));

function run(args) {
  const result = spawnSync(process.execPath, args, { env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function seed() {
  run(["node_modules/tsx/dist/cli.mjs", "prisma/review-seed.ts"]);
}

async function personalRecords() {
  return {
    users: await prisma.user.findMany({ orderBy: { username: "asc" } }),
    profiles: await prisma.userProfile.findMany({ orderBy: { id: "asc" } }),
    plans: await prisma.careerPlan.findMany({ orderBy: { id: "asc" } }),
    memories: await prisma.memoryItem.findMany({ orderBy: { id: "asc" } }),
    conversations: await prisma.chatConversation.findMany({ orderBy: { id: "asc" } }),
    messages: await prisma.chatMessage.findMany({ orderBy: { id: "asc" } }),
  };
}

function checkInvalidCatalogs() {
  const invalidCases = [
    { value: { ...jobCatalog, jobs: [{ ...jobCatalog.jobs[0], userId: "private-account" }] }, pattern: "unrecognized_keys" },
    { value: { ...jobCatalog, jobs: [jobCatalog.jobs[0], jobCatalog.jobs[0]] }, pattern: "Duplicate review job" },
    { value: { ...jobCatalog, jobs: [{ ...jobCatalog.jobs[0], skills: "{}" }] }, pattern: "Invalid JSON field" },
    { value: { ...jobCatalog, jobs: [{ ...jobCatalog.jobs[0], jobLink: "javascript:alert(1)" }] }, pattern: "URL" },
  ];
  for (const [index, { value, pattern }] of invalidCases.entries()) {
    const invalidFile = join(directory, `invalid-jobs-${index}.json`);
    writeFileSync(invalidFile, JSON.stringify(value));
    const script = `import assert from 'node:assert/strict';
      import { readReviewCatalog } from ${JSON.stringify(resolve("prisma/review-catalog.ts"))};
      assert.throws(() => readReviewCatalog({ jobFile: ${JSON.stringify(invalidFile)} }), new RegExp(${JSON.stringify(pattern)}));`;
    run(["node_modules/tsx/dist/cli.mjs", "--eval", script]);
  }
}

try {
  run(["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  seed();
  assert.equal(await prisma.user.count(), 7, "all login-page demo accounts must be available");
  const reviewer = await prisma.user.findUniqueOrThrow({ where: { username: "reviewer" }, include: { profile: true, plans: true } });
  assert.ok(await bcrypt.compare("careermate123", reviewer.passwordHash));
  assert.equal(reviewer.profile.onboardingCompleted, true);
  assert.equal(reviewer.plans.length, 1);
  assert.equal(await prisma.roleTemplate.count(), 3);
  assert.equal(await prisma.resourceItem.count({ where: { status: "active", verificationStatus: "verified" } }), 23,
    "fresh reviewer installation must include usable learning resources");
  assert.equal(await prisma.resourceItem.count(), 23, "placeholder resources are not inserted into a fresh review database");
  assert.equal(await prisma.jobSample.count(), 1213, "fresh reviewer installation must include the public job catalog");
  assert.equal(jobCatalog.jobs.length, 1213);
  assert.equal(await prisma.jobSample.count({ where: { verificationStatus: "unverified" } }), 1213,
    "static job samples must retain their unverified state");
  assert.equal(await prisma.resourceItem.count({ where: { roleKey: "ai_product_manager", status: "active", verificationStatus: "verified" } }), 5);
  await prisma.user.update({ where: { id: reviewer.id }, data: { displayName: "保留评审记录" } });
  await prisma.memoryItem.create({ data: { userId: reviewer.id, source: "review-test", content: "Repeated startup must preserve this record." } });
  await prisma.chatConversation.create({ data: {
    userId: reviewer.id, title: "保留聊天",
    messages: { create: { role: "user", content: "请保留这次评审的聊天记录。" } },
  } });
  await prisma.careerPlan.update({ where: { id: reviewer.plans[0].id }, data: { assumptions: '["用户修改的计划"]' } });
  const editedResource = await prisma.resourceItem.update({
    where: { externalKey: "prompt-engineering-guide" },
    data: { title: "保留手工编辑的资源", status: "inactive", verificationStatus: "stale" },
  });
  const editedJob = await prisma.jobSample.update({
    where: { jobId: jobCatalog.jobs[0].jobId }, data: { title: "保留手工编辑的岗位", company: "本地备注" },
  });
  const editedTemplate = await prisma.roleTemplate.update({ where: { roleKey: "ai_product_manager" }, data: { roleName: "保留手工编辑的模板" } });
  const customResource = await prisma.resourceItem.create({ data: {
    externalKey: "review-custom-resource", title: "本地自建资源", type: "practice", roleKey: "ai_product_manager",
    abilityKey: "projectPractice", stage: "beginner", source: "自建实践项目", description: "应保留的自建资源。",
  } });
  const customJob = await prisma.jobSample.create({ data: {
    jobId: "review-custom-job", title: "本地自建岗位", city: "本地", sourceFile: "[]", sourceBatch: "review-test",
  } });
  const before = await personalRecords();
  seed();
  assert.deepEqual(await personalRecords(), before, "repeat startup must preserve every existing personal record");
  assert.equal(await prisma.resourceItem.count(), 24);
  assert.equal(await prisma.jobSample.count(), 1214);
  assert.deepEqual(await prisma.resourceItem.findUnique({ where: { id: editedResource.id } }), editedResource);
  assert.deepEqual(await prisma.jobSample.findUnique({ where: { id: editedJob.id } }), editedJob);
  assert.deepEqual(await prisma.roleTemplate.findUnique({ where: { id: editedTemplate.id } }), editedTemplate);

  // A partial catalog is repaired without overwriting an existing entry.
  await prisma.resourceItem.delete({ where: { externalKey: "sqlbolt" } });
  await prisma.jobSample.delete({ where: { jobId: jobCatalog.jobs[1].jobId } });
  seed();
  assert.ok(await prisma.resourceItem.findUnique({ where: { externalKey: "sqlbolt" } }));
  assert.ok(await prisma.jobSample.findUnique({ where: { jobId: jobCatalog.jobs[1].jobId } }));
  assert.equal(await prisma.resourceItem.count(), 24);
  assert.equal(await prisma.jobSample.count(), 1214);
  assert.deepEqual(await personalRecords(), before);
  assert.deepEqual(await prisma.resourceItem.findUnique({ where: { id: editedResource.id } }), editedResource);
  assert.deepEqual(await prisma.jobSample.findUnique({ where: { id: editedJob.id } }), editedJob);

  // Simulate an older reviewer installation: accounts already exist, six
  // unverified placeholders exist, but both public catalogs are absent.
  await prisma.resourceItem.deleteMany({ where: { externalKey: { not: customResource.externalKey } } });
  await prisma.jobSample.deleteMany({ where: { jobId: { not: customJob.jobId } } });
  await prisma.roleTemplate.deleteMany({ where: { roleKey: { not: editedTemplate.roleKey } } });
  await prisma.resourceItem.createMany({ data: Array.from({ length: 6 }, (_, index) => ({
    title: `旧版演示资源 ${index + 1}`, type: "practice", roleKey: "ai_product_manager",
    abilityKey: "projectPractice", stage: "beginner", source: "自建实践项目", description: "旧版占位说明。",
  })) });
  seed();
  assert.equal(await prisma.resourceItem.count({ where: { status: "active", verificationStatus: "verified" } }), 23);
  assert.equal(await prisma.resourceItem.count(), 30, "older placeholders and a custom resource must survive the upgrade");
  assert.equal(await prisma.jobSample.count(), 1214);
  assert.equal(await prisma.roleTemplate.count(), 3);
  assert.deepEqual(await personalRecords(), before, "catalog upgrade must preserve users, chats, memories and plans");
  assert.deepEqual(await prisma.resourceItem.findUnique({ where: { id: customResource.id } }), customResource);
  assert.deepEqual(await prisma.jobSample.findUnique({ where: { id: customJob.id } }), customJob);
  assert.deepEqual(await prisma.roleTemplate.findUnique({ where: { id: editedTemplate.id } }), editedTemplate);

  checkInvalidCatalogs();
  assert.deepEqual(await personalRecords(), before);
  console.log("Review setup smoke passed: fresh catalogs, older-package upgrade, partial repair, idempotency, invalid-input rejection and preservation of local edits and personal records.");
} finally {
  await prisma.$disconnect();
  rmSync(directory, { recursive: true, force: true });
}
