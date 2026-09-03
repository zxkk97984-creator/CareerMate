import { describe, expect, it } from "vitest";
import { parseAgentArtifactEnvelope } from "./artifact-envelope";

const validArtifact = {
  schemaVersion: "1.0",
  taskType: "career_plan",
  status: "pending_confirmation",
  summary: "三年计划候选",
  data: {
    plan: {
      schemaVersion: 2,
      title: "数据分析师计划",
      targetRole: { key: "data_analyst", label: "数据分析师" },
      summary: "三年成长为资深数据分析师",
      horizon: { value: 3, unit: "year" },
      phases: [{ id: "p1", title: "阶段一", objective: "入门", duration: { value: 6, unit: "month" }, skills: [], actions: [{ id: "a1", title: "学SQL", description: "基础", type: "learning", status: "not_started", resources: [] }], outputs: [], evaluationCriteria: [], risks: [] }],
      immediateActions: [],
      assumptions: [],
      riskNotes: [],
      evidenceRefs: [],
    },
  },
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

  it("success 状态但 career_plan 缺少 plan 字段 → 被 validated 拒绝", () => {
    const badArtifact = {
      schemaVersion: "1.0",
      taskType: "career_plan",
      status: "success",
      summary: "计划已生成",
      data: { title: "无 plan 字段的自由格式" },
      evidence: [],
      sources: [],
      assumptions: [],
      warnings: [],
      requiresUserConfirmation: false,
      baseVersion: null,
      nextActions: [],
    };
    const result = parseAgentArtifactEnvelope(
      `<CAREERMATE_ARTIFACT>${JSON.stringify(badArtifact)}</CAREERMATE_ARTIFACT>`,
    );
    expect(result.artifact).toBeUndefined();
    expect(result.warnings).toContain("INVALID_ARTIFACT_SCHEMA");
  });

  it("pending_confirmation 但 simulation_report 缺少 abilityEvidence → 被拒绝", () => {
    const badArtifact = {
      schemaVersion: "1.0",
      taskType: "simulation_report",
      status: "pending_confirmation",
      summary: "训练报告",
      data: { score: 85, strengths: ["沟通好"] },
      evidence: [],
      sources: [],
      assumptions: [],
      warnings: [],
      requiresUserConfirmation: true,
      baseVersion: 3,
      nextActions: [],
    };
    const result = parseAgentArtifactEnvelope(
      `<CAREERMATE_ARTIFACT>${JSON.stringify(badArtifact)}</CAREERMATE_ARTIFACT>`,
    );
    expect(result.artifact).toBeUndefined();
    expect(result.warnings).toContain("INVALID_ARTIFACT_SCHEMA");
  });

  it("needs_input 但 data 为空对象 → 被拒绝（缺少 question 或 missingFields）", () => {
    const badArtifact = {
      schemaVersion: "1.0",
      taskType: "career_plan",
      status: "needs_input",
      summary: "需要更多信息",
      data: {},
      evidence: [],
      sources: [],
      assumptions: [],
      warnings: [],
      requiresUserConfirmation: false,
      baseVersion: null,
      nextActions: [],
    };
    const result = parseAgentArtifactEnvelope(
      `<CAREERMATE_ARTIFACT>${JSON.stringify(badArtifact)}</CAREERMATE_ARTIFACT>`,
    );
    expect(result.artifact).toBeUndefined();
    expect(result.warnings).toContain("INVALID_ARTIFACT_SCHEMA");
  });

  it("needs_input 带 question 字段 → 通过验证", () => {
    const validNeedsInput = {
      schemaVersion: "1.0",
      taskType: "career_plan",
      status: "needs_input",
      summary: "需要更多信息",
      data: { question: "请提供你的目标岗位" },
      evidence: [],
      sources: [],
      assumptions: [],
      warnings: [],
      requiresUserConfirmation: false,
      baseVersion: null,
      nextActions: [],
    };
    const result = parseAgentArtifactEnvelope(
      `<CAREERMATE_ARTIFACT>${JSON.stringify(validNeedsInput)}</CAREERMATE_ARTIFACT>`,
    );
    expect(result.artifact).toBeDefined();
    expect(result.warnings).toEqual([]);
  });

  it("error 状态带 message → 通过验证", () => {
    const validError = {
      schemaVersion: "1.0",
      taskType: "career_plan",
      status: "error",
      summary: "生成失败",
      data: { message: "夸克搜索超时", code: "SEARCH_TIMEOUT", recoverable: true },
      evidence: [],
      sources: [],
      assumptions: [],
      warnings: [],
      requiresUserConfirmation: false,
      baseVersion: null,
      nextActions: [],
    };
    const result = parseAgentArtifactEnvelope(
      `<CAREERMATE_ARTIFACT>${JSON.stringify(validError)}</CAREERMATE_ARTIFACT>`,
    );
    expect(result.artifact).toBeDefined();
    expect(result.warnings).toEqual([]);
  });
});
