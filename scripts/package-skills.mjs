#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(root, "dist", "skills");
const stagingRoot = join(outputRoot, ".staging");

const skills = [
  {
    name: "CareerMate职业证据解析",
    dir: "evidence-parser",
    entry: "src/agentic-v2/skills/evidence-parser/cli.ts",
    output: "parseEvidenceBundle",
  },
  {
    name: "CareerMate成长数据分析",
    dir: "growth-analyzer",
    entry: "src/agentic-v2/skills/growth-analyzer/cli.ts",
    output: "analyzeGrowthData",
    rejectsCorruptInput: true,
  },
];

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function validationScript(skill) {
  return `#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const examples = readdirSync(join(here, "examples")).filter((name) => name.endsWith(".json"));
let failed = false;
for (const example of examples) {
  const expectsRejection = ${skill.rejectsCorruptInput === true ? "true" : "false"} && example === "corrupt.json";
  try {
    const output = execFileSync(process.execPath, [join(here, "run.mjs"), join(here, "examples", example)], { encoding: "utf8" });
    if (expectsRejection) {
      failed = true;
      console.error("FAIL", example, "预期被拒绝，但执行成功");
      continue;
    }
    JSON.parse(output);
    console.log("PASS", example);
  } catch (error) {
    if (expectsRejection) {
      console.log("PASS", example, "已按契约拒绝非法输入");
      continue;
    }
    failed = true;
    console.error("FAIL", example, error instanceof Error ? error.message : String(error));
  }
}
process.exit(failed ? 1 : 0);
`;
}

async function packageSkill(skill) {
  const sourceDir = join(root, "src", "agentic-v2", "skills", skill.dir);
  const stageDir = join(stagingRoot, skill.dir);
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });

  await build({
    entryPoints: [join(root, skill.entry)],
    outfile: join(stageDir, "run.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    sourcemap: false,
    banner: { js: "#!/usr/bin/env node" },
    logLevel: "silent",
  });

  copyFileSync(join(sourceDir, "SKILL.md"), join(stageDir, "SKILL.md"));
  cpSync(join(sourceDir, "examples"), join(stageDir, "examples"), { recursive: true });
  writeFileSync(join(stageDir, "validate.mjs"), validationScript(skill), { mode: 0o755 });
  writeJson(join(stageDir, "manifest.json"), {
    schemaVersion: "1.0",
    name: skill.name,
    entrypoint: "run.mjs",
    invocation: "node run.mjs <input.json>，或从 stdin 读取 JSON",
    output: skill.output,
    dependencies: "已由 esbuild 打包进 run.mjs；运行时不需要 npm install",
    source: `src/agentic-v2/skills/${skill.dir}`,
    builtAt: new Date().toISOString(),
  });

  const zipPath = join(outputRoot, `${skill.name}.zip`);
  rmSync(zipPath, { force: true });
  execFileSync("zip", ["-q", "-r", zipPath, "."], { cwd: stageDir });
  return { name: skill.name, zipPath };
}

mkdirSync(outputRoot, { recursive: true });
mkdirSync(stagingRoot, { recursive: true });

const results = [];
for (const skill of skills) results.push(await packageSkill(skill));
console.log(JSON.stringify({ outputRoot, results }, null, 2));
