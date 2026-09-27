import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const directory = mkdtempSync(join(tmpdir(), "careermate-review-test-"));
const database = join(directory, "review.db");
writeFileSync(database, "");
const url = `file:${database.replaceAll("\\", "/")}`;
const env = { ...process.env, DATABASE_URL: url, NODE_ENV: "production" };
const prisma = new PrismaClient({ datasources: { db: { url } } });

function run(args) {
  const result = spawnSync(process.execPath, args, { env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

try {
  run(["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  run(["node_modules/tsx/dist/cli.mjs", "prisma/review-seed.ts"]);
  assert.equal(await prisma.user.count(), 7, "all login-page demo accounts must be available");
  const reviewer = await prisma.user.findUniqueOrThrow({ where: { username: "reviewer" }, include: { profile: true, plans: true } });
  assert.ok(await bcrypt.compare("careermate123", reviewer.passwordHash));
  assert.equal(reviewer.profile.onboardingCompleted, true);
  assert.equal(reviewer.plans.length, 1);
  assert.equal(await prisma.roleTemplate.count(), 3);
  assert.equal(await prisma.resourceItem.count(), 6);
  await prisma.user.update({ where: { id: reviewer.id }, data: { displayName: "保留评审记录" } });
  await prisma.memoryItem.create({ data: { userId: reviewer.id, source: "review-test", content: "Repeated startup must preserve this record." } });
  const before = await prisma.user.findMany({ orderBy: { username: "asc" } });
  run(["node_modules/tsx/dist/cli.mjs", "prisma/review-seed.ts"]);
  assert.deepEqual(await prisma.user.findMany({ orderBy: { username: "asc" } }), before);
  assert.equal(await prisma.memoryItem.count(), 1);
  assert.equal(await prisma.careerPlan.count(), 6);
  console.log("Review setup smoke passed: fresh production database, demo login, repeat startup preserves records.");
} finally {
  await prisma.$disconnect();
  rmSync(directory, { recursive: true, force: true });
}
