import { spawn, spawnSync } from "node:child_process";

const env = { ...process.env, DATABASE_URL: "file:./e2e.db", TBOX_MODE: "mock", NODE_ENV: "production" };
const windows = process.platform === "win32";

for (const args of [["prisma", "migrate", "reset", "--force", "--skip-seed"], ["tsx", "prisma/seed.ts"]]) {
  const result = windows
    ? spawnSync("cmd.exe", ["/d", "/c", `npx.cmd ${args.join(" ")}`], { env, stdio: "inherit" })
    : spawnSync("npx", args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const build = windows
  ? spawnSync("cmd.exe", ["/d", "/c", "npm.cmd run build"], { env, stdio: "inherit" })
  : spawnSync("npm", ["run", "build"], { env, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const server = windows
  ? spawn("cmd.exe", ["/d", "/c", "npm.cmd run start -- --hostname 127.0.0.1 --port 3100"], { env, stdio: "inherit" })
  : spawn("npm", ["run", "start", "--", "--hostname", "127.0.0.1", "--port", "3100"], { env, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code ?? 0));
