import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, it, expect } from "vitest";
import { validatedAgentArtifactV1Schema } from "./contracts";
import { buildPlatformContractExample } from "./platform-contracts";

describe("exported platform delivery", () => {
  it("merges prompts and produces standalone runnable nodes", async () => {
    const out = mkdtempSync(join(tmpdir(), "tbox-export-test-"));
    try {
      execFileSync(process.execPath, ["scripts/export-tbox-bundle.mjs", "--out-dir", out], { stdio: "pipe" });
      const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
      for (const entry of manifest.files.filter((f: unknown) => typeof f === "object")) {
        const prompt = readFileSync(join(out, entry.path, "llm-prompt.txt"), "utf8");
        expect(prompt).toContain("# V2 工作流共同契约");
        expect(prompt.match(/\{\{request\}\}/g)).toHaveLength(1);
        expect(prompt).not.toContain("exports.main");
        const code = readFileSync(join(out, entry.path, "code-node.js"), "utf8");
        const codeModule = { exports: {} as { main: (event: unknown) => Promise<{ artifact: unknown }> } };
        expect(code).toMatch(/^exports\.main = async \(event\) =>/);
        expect(code).not.toContain("module.exports");
        // Platform-style exports host: no Node module global is available.
        runInNewContext(code, { exports: codeModule.exports });
        const type = entry.types[0];
        const value = { schemaVersion: "1.0", taskType: type, status: "needs_input", summary: "需要更多信息", data: { question: "请提供目标" }, evidence: [], sources: [], assumptions: [], warnings: [], requiresUserConfirmation: false, baseVersion: null, nextActions: [] };
        const result = await codeModule.exports.main({ ...buildPlatformContractExample(type), raw: JSON.stringify(value) });
        expect(result.artifact).toEqual(value);
        expect(validatedAgentArtifactV1Schema.safeParse(JSON.parse(JSON.stringify(result.artifact))).success).toBe(true);
      }
    } finally { rmSync(out, { recursive: true, force: true }); }
  });
  it("all workflow output examples match current backend schema", () => {
    for (const filename of readdirSync("src/agentic-v2/platform/workflows").filter((f) => f.startsWith("V2"))) {
      const source = readFileSync(join("src/agentic-v2/platform/workflows", filename), "utf8");
      for (const match of source.matchAll(/```json\n([\s\S]*?)\n```/g)) {
        const value = JSON.parse(match[1]);
        if (!value.status) continue;
        const parsed = validatedAgentArtifactV1Schema.safeParse(value);
        expect(parsed.success, filename + ": " + JSON.stringify(parsed.success ? [] : parsed.error.issues)).toBe(true);
      }
    }
  });
});
