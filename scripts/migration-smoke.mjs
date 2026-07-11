import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prismaCli = join(root, "node_modules", "prisma", "build", "index.js");
const schemaPath = join(root, "prisma", "schema.prisma");
const migrationsPath = join(root, "prisma", "migrations");
const liveDatabasePath = resolve(root, "prisma", "dev.db");
const baselineName = "20260710000000_baseline";
const expectedMigrationNames = readdirSync(migrationsPath, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const tempRoot = mkdtempSync(join(tmpdir(), "careermate-migrations-"));
const debugEnabled = process.env.MIGRATION_SMOKE_DEBUG === "1";

function debug(label, value = "") {
  if (debugEnabled) console.error(`[migration-smoke:debug] ${label}`, value);
}

function databaseUrl(databasePath) {
  const absolutePath = resolve(databasePath);
  const relativeToTemp = relative(tempRoot, absolutePath);
  if (
    absolutePath === liveDatabasePath ||
    relativeToTemp === "" ||
    relativeToTemp === ".." ||
    relativeToTemp.startsWith(`..${sep}`)
  ) {
    throw new Error(`Refusing to use non-temporary database path: ${absolutePath}`);
  }

  return `file:${absolutePath.replaceAll("\\", "/")}`;
}

function runPrisma(label, args, databasePath) {
  debug("spawn", { label, args, databaseUrl: databaseUrl(databasePath) });
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl(databasePath),
      NO_COLOR: "1",
    },
  });
  debug("child-result", {
    label,
    status: result.status,
    signal: result.signal,
    error: result.error?.stack,
    stdout: result.stdout,
    stderr: result.stderr,
  });

  if (result.error || result.status !== 0) {
    throw new Error(
      [
        `${label} failed (exit ${result.status ?? "spawn error"}).`,
        result.error?.stack,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function withDatabase(databasePath, action) {
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl(databasePath) } },
  });
  try {
    return await action(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function verifyFreshDatabase() {
  const databasePath = join(tempRoot, "fresh.db");
  runPrisma("Fresh database migration deploy", ["migrate", "deploy", "--schema", schemaPath], databasePath);
  runPrisma(
    "Fresh database schema drift check",
    [
      "migrate",
      "diff",
      "--from-url",
      databaseUrl(databasePath),
      "--to-schema-datamodel",
      schemaPath,
      "--exit-code",
    ],
    databasePath,
  );

  await withDatabase(databasePath, async (prisma) => {
    const migrations = await prisma.$queryRawUnsafe(
      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name',
    );
    assert(
      migrations.map((row) => row.migration_name).join(",") === expectedMigrationNames.join(","),
      `Fresh database did not apply the expected migrations: ${JSON.stringify(migrations)}`,
    );
    const foreignKeyProblems = await prisma.$queryRawUnsafe("PRAGMA foreign_key_check");
    assert(foreignKeyProblems.length === 0, `Fresh database foreign-key violations: ${JSON.stringify(foreignKeyProblems)}`);
  });
}

function createBaselineOnlyMigrationDirectory() {
  const legacyPrismaDir = join(tempRoot, "legacy-prisma");
  const legacyMigrationsDir = join(legacyPrismaDir, "migrations");
  debug("legacy-fixture-mkdir", legacyMigrationsDir);
  mkdirSync(legacyMigrationsDir, { recursive: true });
  debug("legacy-fixture-schema-copy");
  writeFileSync(join(legacyPrismaDir, "schema.prisma"), readFileSync(schemaPath));
  debug("legacy-fixture-lock-copy");
  copyFileSync(
    join(root, "prisma", "migrations", "migration_lock.toml"),
    join(legacyMigrationsDir, "migration_lock.toml"),
  );
  debug("legacy-fixture-baseline-copy");
  const legacyBaselineDir = join(legacyMigrationsDir, baselineName);
  mkdirSync(legacyBaselineDir);
  copyFileSync(
    join(root, "prisma", "migrations", baselineName, "migration.sql"),
    join(legacyBaselineDir, "migration.sql"),
  );
  debug("legacy-fixture-ready");
  return join(legacyPrismaDir, "schema.prisma");
}

async function createLegacyFixture(databasePath, legacySchemaPath) {
  runPrisma(
    "Legacy baseline fixture creation",
    ["migrate", "deploy", "--schema", legacySchemaPath],
    databasePath,
  );

  await withDatabase(databasePath, async (prisma) => {
    const statements = [
      `INSERT INTO "User" ("id", "username", "displayName", "passwordHash", "role", "createdAt", "updatedAt") VALUES ('legacy-user', 'legacy_user', 'Legacy User', 'legacy-hash', 'user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      `INSERT INTO "UserProfile" ("id", "userId", "educationStage", "major", "targetRole", "targetRoleLabel", "weeklyAvailableHours", "learningPreference", "experienceSummary", "interestTags", "constraints", "abilityScores", "memoryEnabled", "createdAt", "updatedAt") VALUES ('legacy-profile', 'legacy-user', 'senior', 'Computer Science', 'ai_engineer', 'AI Engineer', 9, '["video"]', 'legacy summary', '["agents"]', '["time"]', '{"aiTooling":88}', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      `INSERT INTO "SimulationSession" ("id", "userId", "scenarioKey", "scenarioTitle", "transcript", "score", "feedback", "status", "createdAt", "updatedAt") VALUES ('legacy-simulation', 'legacy-user', 'legacy-scene', 'Legacy Scene', '[{"role":"user","content":"hello"}]', 77, '{"summary":"kept"}', 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    ];
    for (const statement of statements) await prisma.$executeRawUnsafe(statement);
    await prisma.$executeRawUnsafe('DROP TABLE "_prisma_migrations"');
  });
}

async function verifyLegacyDatabase() {
  const databasePath = join(tempRoot, "legacy.db");
  debug("legacy-fixture-start");
  const legacySchemaPath = createBaselineOnlyMigrationDirectory();
  debug("legacy-fixture-create-db");
  await createLegacyFixture(databasePath, legacySchemaPath);

  runPrisma(
    "Legacy database baseline resolution",
    ["migrate", "resolve", "--applied", baselineName, "--schema", schemaPath],
    databasePath,
  );
  runPrisma("Legacy database P0 migration deploy", ["migrate", "deploy", "--schema", schemaPath], databasePath);

  await withDatabase(databasePath, async (prisma) => {
    const profiles = await prisma.$queryRawUnsafe(
      `SELECT "educationStage", "major", "targetRole", "weeklyAvailableHours", "experienceSummary", "memoryEnabled", "onboardingCompleted" FROM "UserProfile" WHERE "id" = 'legacy-profile'`,
    );
    assert(profiles.length === 1, `Legacy profile row count changed: ${profiles.length}`);
    const profile = profiles[0];
    assert(profile.educationStage === "senior", `Legacy educationStage was not preserved: ${profile.educationStage}`);
    assert(profile.major === "Computer Science", `Legacy major was not preserved: ${profile.major}`);
    assert(profile.targetRole === "ai_engineer", `Legacy targetRole was not preserved: ${profile.targetRole}`);
    assert(Number(profile.weeklyAvailableHours) === 9, `Legacy weeklyAvailableHours was not preserved: ${profile.weeklyAvailableHours}`);
    assert(profile.experienceSummary === "legacy summary", `Legacy experienceSummary was not preserved: ${profile.experienceSummary}`);
    assert(Number(profile.memoryEnabled) === 0, `Legacy memoryEnabled was not preserved: ${profile.memoryEnabled}`);
    assert(Number(profile.onboardingCompleted) === 1, `Legacy profile was not backfilled complete: ${profile.onboardingCompleted}`);

    const simulations = await prisma.$queryRawUnsafe(
      `SELECT "scenarioKey", "transcript", "score", "feedback", "turnCount", "requestedMode", "actualMode", "candidateId" FROM "SimulationSession" WHERE "id" = 'legacy-simulation'`,
    );
    assert(simulations.length === 1, `Legacy simulation row count changed: ${simulations.length}`);
    const simulation = simulations[0];
    assert(simulation.scenarioKey === "legacy-scene", `Legacy scenarioKey was not preserved: ${simulation.scenarioKey}`);
    assert(
      simulation.transcript === '[{"role":"user","content":"hello"}]',
      `Legacy transcript was not preserved: ${simulation.transcript}`,
    );
    assert(Number(simulation.score) === 77, `Legacy simulation score was not preserved: ${simulation.score}`);
    assert(simulation.feedback === '{"summary":"kept"}', `Legacy feedback was not preserved: ${simulation.feedback}`);
    assert(Number(simulation.turnCount) === 0, `Simulation turnCount default is invalid: ${simulation.turnCount}`);
    assert(simulation.requestedMode === "mock", `Simulation requestedMode default is invalid: ${simulation.requestedMode}`);
    assert(simulation.actualMode === "mock", `Simulation actualMode default is invalid: ${simulation.actualMode}`);
    assert(simulation.candidateId === null, `Simulation candidateId should remain unwired: ${simulation.candidateId}`);

    const foreignKeyProblems = await prisma.$queryRawUnsafe("PRAGMA foreign_key_check");
    assert(foreignKeyProblems.length === 0, `Legacy database foreign-key violations: ${JSON.stringify(foreignKeyProblems)}`);
  });
}

try {
  debug("temp-root", tempRoot);
  debug("fresh-start");
  await verifyFreshDatabase();
  debug("fresh-complete");
  debug("legacy-start");
  await verifyLegacyDatabase();
  debug("legacy-complete");
  console.log("Migration smoke test passed (fresh deploy/drift and legacy preservation/FKs).");
} catch (error) {
  console.error(`[migration-smoke] ${error instanceof Error ? error.stack : error}`);
  process.exitCode = 1;
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
