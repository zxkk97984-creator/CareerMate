import { describe, expect, it } from "vitest";
import { parseAgentArtifactEnvelope } from "./artifact-envelope";

const validArtifact = {
  schemaVersion: "1.0",
  taskType: "career_plan",
  status: "pending_confirmation",
  summary: "三年计划候选",
  data: { targetRole: "data_analyst", phases: [] },
  evidence: [],
  sources: [],
  assumptions: [],
  warnings: [],
  requiresUserConfirmation: true,
  baseVersion: 3,
  nextActions: [],
};

describe("CAREERMATE_ARTIFACT 信封解析器", () => {
  it("提取一个有效 artifact 并从可视文本中移除信封", () => {
    const result = parseAgentArtifactEnvelope(
      `这是给用户看的答案。\n<CAREERMATE_ARTIFACT>\n${JSON.stringify(validArtifact)}\n</CAREERMATE_ARTIFACT>`,
    );
    expect(result.displayText).toBe("这是给用户看的答案。");
    expect(result.artifact).toEqual(validArtifact);
    expect(result.warnings).toEqual([]);
  });

  it("不解包无标签 JSON 或 Markdown 代码块", () => {
    for (const text of [
      JSON.stringify(validArtifact),
      `\`\`\`json\n${JSON.stringify(validArtifact)}\n\`\`\``,
    ]) {
      const result = parseAgentArtifactEnvelope(text);
      expect(result.artifact).toBeUndefined();
    }
  });

  it("拒绝多个信封", () => {
    const block = `<CAREERMATE_ARTIFACT>${JSON.stringify(validArtifact)}</CAREERMATE_ARTIFACT>`;
    const result = parseAgentArtifactEnvelope(`${block}\n${block}`);
    expect(result.artifact).toBeUndefined();
    expect(result.warnings).toContain("MULTIPLE_ARTIFACT_ENVELOPES");
  });

  it("对无效 JSON 或 schema 保留可读文本，不执行 artifact 操作", () => {
    const result = parseAgentArtifactEnvelope(
      "可读答案\n<CAREERMATE_ARTIFACT>{bad json}</CAREERMATE_ARTIFACT>",
    );
    expect(result.displayText).toBe("可读答案");
    expect(result.artifact).toBeUndefined();
    expect(result.warnings).toContain("INVALID_ARTIFACT_ENVELOPE");
  });

  it("处理缺失闭合标签", () => {
    const result = parseAgentArtifactEnvelope(
      `文本\n<CAREERMATE_ARTIFACT>${JSON.stringify(validArtifact)}`,
    );
    expect(result.artifact).toBeUndefined();
    expect(result.warnings).toContain("INVALID_ARTIFACT_ENVELOPE");
  });

  it("处理空可视文本", () => {
    const result = parseAgentArtifactEnvelope(
      `<CAREERMATE_ARTIFACT>${JSON.stringify(validArtifact)}</CAREERMATE_ARTIFACT>`,
    );
    expect(result.displayText).toBe("");
    expect(result.artifact).toEqual(validArtifact);
    expect(result.warnings).toEqual([]);
  });

  it("拒绝超过 65536 字节的信封", () => {
    const largeData = "x".repeat(66_000);
    const result = parseAgentArtifactEnvelope(
      `文本\n<CAREERMATE_ARTIFACT>${largeData}</CAREERMATE_ARTIFACT>`,
    );
    expect(result.artifact).toBeUndefined();
    expect(result.warnings).toContain("ARTIFACT_ENVELOPE_TOO_LARGE");
  });

  it("拒绝嵌套标签", () => {
    const inner = `<CAREERMATE_ARTIFACT>${JSON.stringify(validArtifact)}</CAREERMATE_ARTIFACT>`;
    const result = parseAgentArtifactEnvelope(
      `<CAREERMATE_ARTIFACT>${inner}</CAREERMATE_ARTIFACT>`,
    );
    expect(result.artifact).toBeUndefined();
  });

  it("不符合 schema 的 JSON 被标记为 INVALID_ARTIFACT_SCHEMA", () => {
    const result = parseAgentArtifactEnvelope(
      `<CAREERMATE_ARTIFACT>{"schemaVersion":"1.0","taskType":"invalid_task"}</CAREERMATE_ARTIFACT>`,
    );
    expect(result.artifact).toBeUndefined();
    expect(result.warnings).toContain("INVALID_ARTIFACT_SCHEMA");
  });
});
