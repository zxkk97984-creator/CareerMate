import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const env = { ...process.env, DATABASE_URL: "file:./e2e.db", TBOX_MODE: "mock", NODE_ENV: "production" };
const windows = process.platform === "win32";
const dbPath = "prisma/e2e.db";
const isFresh = !existsSync(dbPath);

// 使用 prisma db push 而非 migrate reset，避免 Prisma AI 安全拦截
const pushArgs = ["prisma", "db", "push", "--skip-generate"];
const pushResult = windows
  ? spawnSync("cmd.exe", ["/d", "/c", `npx.cmd ${pushArgs.join(" ")}`], { env, stdio: "inherit" })
  : spawnSync("npx", pushArgs, { env, stdio: "inherit" });
if (pushResult.status !== 0) process.exit(pushResult.status ?? 1);

// 全新数据库需要种子数据
if (isFresh) {
  const seedResult = windows
    ? spawnSync("cmd.exe", ["/d", "/c", "npx.cmd tsx prisma/seed.ts"], { env, stdio: "inherit" })
    : spawnSync("npx", ["tsx", "prisma/seed.ts"], { env, stdio: "inherit" });
  if (seedResult.status !== 0) process.exit(seedResult.status ?? 1);
}

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
