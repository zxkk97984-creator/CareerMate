import { spawn, spawnSync } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";

const env = {
  ...process.env,
  DATABASE_URL: "file:./e2e.db",
  TBOX_MODE: "mock",
  TBOX_STRUCTURED_MODE: "terminal",
  NODE_ENV: "production",
  AGENT_OPERATIONS_V1: "true",
  PLAN_V2_WRITE: "true",
  STATEFUL_CHAT_TURNS: "true",
  OPEN_CHAT_ENTRY: "true",
  CAREERMATE_E2E: "true", // E2E 环境标记，seed 正常运行
  ALLOW_DESTRUCTIVE_SEED: "true", // E2E 需要全新数据库
  // T25a：显式固定关键开关，不继承开发机真实配置；增量 V2 解耦见 e2e:serve:v2
  CAREERMATE_AGENTIC_V2: process.env.E2E_AGENTIC_V2 ?? "false",
};
const windows = process.platform === "win32";
const dbPath = "prisma/e2e.db";

// 删除旧 E2E 数据库以确保每次测试有干净环境
if (existsSync(dbPath)) {
  try { unlinkSync(dbPath); } catch { /* ignore */ }
  try { unlinkSync(dbPath + "-journal"); } catch { /* ignore */ }
}

// Some SQLite engine builds require the empty file before migration initialization.
if (!existsSync(dbPath)) writeFileSync(dbPath, "", { flag: "wx" });

// 用迁移建立独立测试库（不能只 db push 后就说迁移验证通过）——T25a
const migrateArgs = ["prisma", "migrate", "deploy"];
const migrateResult = windows
  ? spawnSync("cmd.exe", ["/d", "/c", `npx.cmd ${migrateArgs.join(" ")}`], { env, stdio: "inherit" })
  : spawnSync("npx", migrateArgs, { env, stdio: "inherit" });
if (migrateResult.status !== 0) process.exit(migrateResult.status ?? 1);

// 种子数据
const seedResult = windows
  ? spawnSync("cmd.exe", ["/d", "/c", "npx.cmd tsx prisma/seed.ts"], { env, stdio: "inherit" })
  : spawnSync("npx", ["tsx", "prisma/seed.ts"], { env, stdio: "inherit" });
if (seedResult.status !== 0) process.exit(seedResult.status ?? 1);

const buildArgs = ["run", "build"];
const build = windows
  ? spawnSync("cmd.exe", ["/d", "/c", `npm.cmd ${buildArgs.join(" ")}`], { env, stdio: "inherit" })
  : spawnSync("npm", buildArgs, { env, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const startArgs = ["run", "start", "--", "--hostname", "127.0.0.1", "--port", "3100"];
const server = windows
  ? spawn("cmd.exe", ["/d", "/c", `npm.cmd ${startArgs.join(" ")}`], { env, stdio: "inherit" })
  : spawn("npm", startArgs, { env, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code ?? 0));
