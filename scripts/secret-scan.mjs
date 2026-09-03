import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

const cwd = process.cwd();

function collectDir(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (["node_modules", ".next", "work", "uploads", "exports", "screenshots", "private", "local"].includes(entry.name)) {
        continue;
      }
      collectDir(abs, out);
    } else if (entry.isFile()) {
      out.push(abs);
    }
  }
}

function gitTrackedCandidates() {
  try {
    return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    // 非 git 环境（例如导出包/工作副本）：扫描项目关键目录，排除本地环境与数据库
    const out = [];
    for (const top of ["src", "scripts", "e2e", "docs", "prisma"]) {
      collectDir(top, out);
    }
    for (const file of [
      "package.json",
      "next.config.ts",
      "next.config.test.ts",
      "eslint.config.mjs",
      "tsconfig.json",
      "vitest.config.ts",
      "playwright.config.ts",
      "postcss.config.mjs",
      "README.md",
    ]) {
      if (existsSync(file)) out.push(file);
    }
    // 本地环境文件与数据库不应进入扫描结果（等同 gitignore）
    const localSkipPatterns = [
      /(^|\/)node_modules\//,
      /(^|\/)work\//,
      /(^|\/)\.next\//,
      /\.(db|sqlite|sqlite3)$/i,
      /^\.env(?:\..*)?$/,
    ];
    return out.filter((file) => {
      const normalized = file.replaceAll("\\", "/");
      if (normalized === ".env.example") return true;
      return !localSkipPatterns.some((pattern) => pattern.test(normalized));
    });
  }
}

const trackedCandidates = gitTrackedCandidates();

const blockedFilePatterns = [
  /^\.env(\.|$)/,
  /(^|\/)dev\.(db|sqlite|sqlite3)$/i,
  /\.(db|sqlite|sqlite3)$/i,
  /(^|\/)(uploads|exports|screenshots|private|local)(\/|$)/i,
  /(^|\/).*(secret|credential|api-key|token).*$/i,
];

const contentPatterns = [
  {
    name: "Baibaoxiang API key",
    pattern: /inc-ak[a-zA-Z0-9]{16,}/,
  },
  {
    name: "Generic bearer token assignment",
    pattern: /(api[_-]?key|secret|token|password)\s*[:=]\s*["'][A-Za-z0-9_\-]{24,}["']/i,
  },
  {
    name: "OpenAI-style secret key",
    pattern: /sk-[A-Za-z0-9_\-]{20,}/,
  },
];

const allowedPatterns = [/^\.env\.example$/, /^scripts\/secret-scan\.mjs$/];

// Live2D 模型与纹理是产品运行必需资源，允许二进制进入版本库
const allowedBinaryPatterns = [/^public\/live2d\//];

const allowedContentFiles = new Set(["scripts/secret-scan.mjs"]);
const failures = [];

for (const file of trackedCandidates) {
  const normalized = file.replaceAll("\\", "/");

  // .env.example 允许路径通过，但内容仍需扫描真实 key
  const isAllowedPath = allowedPatterns.some((p) => p.test(normalized));

  if (!isAllowedPath && blockedFilePatterns.some((pattern) => pattern.test(normalized))) {
    failures.push(`Blocked file path: ${file}`);
    continue;
  }

  if (!existsSync(file) || statSync(file).isDirectory()) {
    continue;
  }

  const buffer = readFileSync(file);
  if (buffer.includes(0) && !allowedBinaryPatterns.some((pattern) => pattern.test(normalized))) {
    failures.push(`Binary file should not be committed without review: ${file}`);
    continue;
  }

  const content = buffer.toString("utf8");
  for (const rule of contentPatterns) {
    if (rule.pattern.test(content) && !allowedContentFiles.has(normalized)) {
      failures.push(`${rule.name} detected in ${file}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Secret scan failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Secret scan passed (${trackedCandidates.length} files checked).`);
