import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const { values } = parseArgs({ options: {
  port: { type: "string", default: "3000" },
  "no-open": { type: "boolean", default: false },
  "setup-only": { type: "boolean", default: false },
} });
const port = Number(values.port);
const runtime = join(root, ".careermate");
const stamp = join(runtime, "review-build.json");
const lock = join(runtime, "review-launch.pid");
const windows = process.platform === "win32";
let child;
let ownsLock = false;

function lockLaunch() {
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, "utf8"));
    let running = false;
    if (Number.isInteger(pid) && pid > 0) {
      try { process.kill(pid, 0); running = true; }
      catch (error) { if (error.code !== "ESRCH") throw error; }
    }
    if (running) throw new Error("CareerMate is already starting or running from this folder. Use its existing terminal window.");
    unlinkSync(lock);
  }
  writeFileSync(lock, String(process.pid), { flag: "wx" });
  ownsLock = true;
}

process.on("exit", () => {
  if (ownsLock) {
    try { unlinkSync(lock); } catch { /* already removed */ }
  }
});

function runNode(args, env) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: "inherit" });
  if (result.error || result.status !== 0) throw new Error(`Step failed: ${args[0]}. Resolve the error above and run the launcher again.`);
}

function npm(args, env) {
  // All npm arguments are fixed by this script, never derived from user input.
  const result = windows
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", `npm.cmd ${args.join(" ")}`], { cwd: root, env, stdio: "inherit" })
    : spawnSync("npm", args, { cwd: root, env, stdio: "inherit" });
  if (result.error || result.status !== 0) throw new Error("Dependency installation failed. Check the network and run the launcher again.");
}

function fingerprint(paths) {
  const hash = createHash("sha256");
  function visit(path) {
    if (!existsSync(path)) return;
    const entries = readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) { hash.update(file.slice(root.length)); hash.update(readFileSync(file)); }
    }
  }
  for (const path of paths) {
    const full = join(root, path);
    if (!existsSync(full)) continue;
    if (path === "src" || path === "public") visit(full);
    else { hash.update(path); hash.update(readFileSync(full)); }
  }
  return hash.digest("hex");
}

function assertFreePort() {
  return new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once("error", () => reject(new Error(`Port ${port} is in use. Close the other service or run with --port 3001.`)));
    socket.listen(port, "127.0.0.1", () => socket.close(resolve));
  });
}

function openBrowser(url) {
  const command = windows ? "rundll32.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = windows ? ["url.dll,FileProtocolHandler", url] : [url];
  const browser = spawn(command, args, { stdio: "ignore", detached: true });
  browser.on("error", () => console.log(`Open ${url} in your browser.`));
  browser.unref();
}

async function main() {
  if (![22, 24].includes(Number(process.versions.node.split(".")[0]))) throw new Error("Use Node.js 22 or 24 LTS, or start with the provided OS launcher.");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Port must be an integer from 1024 to 65535.");
  if (!values["setup-only"]) await assertFreePort();
  mkdirSync(runtime, { recursive: true });
  lockLaunch();
  if (!existsSync(".env")) copyFileSync(".env.example", ".env");
  const config = parseEnv(readFileSync(".env", "utf8"));
  const env = {
    ...process.env, ...config,
    // An isolated local database; never touch the author's development database.
    DATABASE_URL: "file:./review.db",
    NEXT_PUBLIC_APP_URL: `http://localhost:${port}`,
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "production",
  };
  if (env.TBOX_MODE === "api" && (!env.TBOX_API_KEY || !env.TBOX_AGENT_ID || env.TBOX_API_KEY === "placeholder")) {
    throw new Error("API configuration is incomplete. Fill TBOX_API_KEY and TBOX_AGENT_ID in .env.");
  }
  let previous = {};
  try { previous = JSON.parse(readFileSync(stamp, "utf8")); } catch { /* first launch */ }
  const dependencyKey = fingerprint(["package.json", "package-lock.json"]) + process.version + process.platform + process.arch;
  if (previous.dependencyKey !== dependencyKey || !existsSync("node_modules/next/dist/bin/next") || !existsSync("node_modules/.prisma/client/index.js")) {
    console.log("[1/4] Downloading locked dependencies (first launch may take several minutes)...");
    npm(["ci", "--include=dev", "--ignore-scripts", "--no-audit", "--no-fund"], env);
    // Only these reviewed native installers are needed. Prisma Client is generated explicitly below.
    npm(["rebuild", "@prisma/engines", "esbuild", "sharp"], env);
  } else console.log("[1/4] Dependencies already prepared.");
  runNode(["node_modules/prisma/build/index.js", "generate"], env);
  console.log("[2/4] Preparing local database (existing records are preserved)...");
  if (!existsSync("prisma/review.db")) writeFileSync("prisma/review.db", "", { flag: "wx" });
  runNode(["node_modules/prisma/build/index.js", "migrate", "deploy"], env);
  runNode(["node_modules/tsx/dist/cli.mjs", "prisma/review-seed.ts"], env);
  const buildKey = fingerprint(["src", "public", "next.config.ts", "tsconfig.json", "postcss.config.mjs", "prisma/schema.prisma", ".env"]) + dependencyKey + port;
  if (previous.buildKey !== buildKey || !existsSync(".next/BUILD_ID")) {
    console.log("[3/4] Building CareerMate...");
    runNode(["node_modules/next/dist/bin/next", "build", "--webpack"], env);
    writeFileSync(stamp, JSON.stringify({ dependencyKey, buildKey }));
  } else console.log("[3/4] Reusing the prepared build.");
  if (values["setup-only"]) { console.log("Setup complete."); return; }
  const url = `http://localhost:${port}`;
  console.log(`[4/4] Starting ${url}\nKeep this window open. Press Ctrl+C to stop.\nDemo login: reviewer / careermate123 (for a fresh review database).`);
  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: root, env, stdio: "inherit" });
  child.on("error", () => { console.error("Could not start the server."); process.exitCode = 1; });
  child.on("exit", (code) => { process.exitCode = process.exitCode || code || 0; });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error("The server exited before it was ready.");
    try {
      const response = await fetch(`http://127.0.0.1:${port}/login`, { signal: AbortSignal.timeout(1500) });
      await response.body?.cancel();
      if (response.ok) {
        console.log(`CareerMate is ready: ${url}`);
        if (!values["no-open"]) openBrowser(url);
        return;
      }
    } catch { /* wait for the server */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The server did not become ready. Check the messages above.");
}

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  if (child) child.kill(signal);
  else process.exit(signal === "SIGINT" ? 130 : 143);
});
main().catch((error) => {
  console.error(`\nCareerMate: ${error.message}`);
  child?.kill();
  process.exitCode = 1;
});
