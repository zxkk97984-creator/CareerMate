import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const cwd = process.cwd();

const trackedCandidates = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  cwd,
  encoding: "utf8",
})
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

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
  if (buffer.includes(0)) {
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
