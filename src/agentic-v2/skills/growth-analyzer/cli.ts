import { readFileSync } from "node:fs";
import { analyzeGrowthData } from "./analyzer";

function readInput(): unknown {
  const path = process.argv[2];
  const raw = path && path !== "-"
    ? readFileSync(path, "utf8")
    : readFileSync(0, "utf8");
  return JSON.parse(raw);
}

try {
  const result = analyzeGrowthData(readInput() as Parameters<typeof analyzeGrowthData>[0]);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    error: "GROWTH_ANALYSIS_FAILED",
    message: error instanceof Error ? error.message.slice(0, 300) : "unknown error",
  })}\n`);
  process.exitCode = 1;
}
