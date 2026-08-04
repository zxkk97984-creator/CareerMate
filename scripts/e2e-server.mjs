import { spawn, spawnSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";

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
};
const windows = process.platform === "win32";
const dbPath = "prisma/e2e.db";

// 删除旧 E2E 数据库以确保每次测试有干净环境
if (existsSync(dbPath)) {
  try { unlinkSync(dbPath); } catch { /* ignore */ }
  try { unlinkSync(dbPath + "-journal"); } catch { /* ignore */ }
}

// 创建全新数据库
const pushArgs = ["prisma", "db", "push", "--skip-generate"];
const pushResult = windows
  ? spawnSync("cmd.exe", ["/d", "/c", `npx.cmd ${pushArgs.join(" ")}`], { env, stdio: "inherit" })
  : spawnSync("npx", pushArgs, { env, stdio: "inherit" });
if (pushResult.status !== 0) process.exit(pushResult.status ?? 1);

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
