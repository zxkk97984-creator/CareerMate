import { describe, expect, it } from "vitest";
import { parseStructuredAssistantResult } from "./structured-result";
import { profileAssessmentSchema } from "./capability-schemas";

describe("structured result parsing", () => {
  it("validates structured from result.structured field", () => {
    const valid = {
      type: "profile_assessment" as const,
      targetRole: "data_analyst",
      scores: { aiTooling: 60, roleFoundation: 60, dataAnalysis: 70, businessProduct: 50, communication: 55, projectPractice: 45 },
      strengths: ["数据分析基础扎实"],
      gaps: ["产品思维较弱"],
      evidence: ["用户完成了3个数据项目"],
      assumptions: ["假设用户有SQL基础"],
      needsConfirmation: true as const,
      candidateUpdates: [],
    };
    const result = parseStructuredAssistantResult({
      text: "评估完成",
      structured: valid,
      citations: [],
      warnings: [],
    });
    expect(result.structured).toBeDefined();
    expect(result.structured).toMatchObject({ type: "profile_assessment" });
  });

  it("rejects an unconfirmed profile assessment candidate", () => {
    const parsed = profileAssessmentSchema.safeParse({
      type: "profile_assessment",
      targetRole: "data_analyst",
      scores: { aiTooling: 60, roleFoundation: 60, dataAnalysis: 70, businessProduct: 50, communication: 55, projectPractice: 45 },
      strengths: [],
      gaps: [],
      evidence: [],
      assumptions: [],
      needsConfirmation: false,
    });
    expect(parsed.success).toBe(false);
  });

  it("adds SCHEMA_MISMATCH warning when structured fails validation", () => {
    const result = parseStructuredAssistantResult({
      text: "评估完成",
      structured: { type: "unknown_type", foo: "bar" },
      citations: [],
      warnings: [],
    });
    expect(result.structured).toBeUndefined();
    expect(result.warnings).toContain("SCHEMA_MISMATCH");
    // Markdown 文本保留了
    expect(result.text).toBe("评估完成");
  });

  it("旧 capability 路径从 Markdown 代码块提取 JSON（非主聊天）", () => {
    const result = parseStructuredAssistantResult({
      text: '这是分析结果\n```json\n{"type":"profile_assessment","targetRole":"data_analyst","scores":{"aiTooling":60,"roleFoundation":60,"dataAnalysis":70,"businessProduct":50,"communication":55,"projectPractice":45},"strengths":["分析能力强"],"gaps":["缺少产品经验"],"evidence":["完成过数据分析"],"assumptions":["具备基础SQL"],"needsConfirmation":true,"candidateUpdates":[]}\n```\n以上是评估结果',
      structured: undefined,
      citations: [],
      warnings: [],
    });
    // 旧 capability 解析器从正文提取（仅模拟训练等旧接口使用，主聊天不调用）
    expect(result.structured).toBeDefined();
    expect(result.structured).toMatchObject({ type: "profile_assessment" });
    expect(result.text).toContain("这是分析结果");
  });

  it("returns undefined structured for non-JSON text", () => {
    const result = parseStructuredAssistantResult({
      text: "只是一段普通文本回复，没有任何JSON结构。",
      structured: undefined,
      citations: [],
      warnings: [],
    });
    expect(result.structured).toBeUndefined();
    expect(result.text).toBe("只是一段普通文本回复，没有任何JSON结构。");
    expect(result.warnings).not.toContain("SCHEMA_MISMATCH");
  });

  it("rejects score out of bounds", () => {
    const parsed = profileAssessmentSchema.safeParse({
      type: "profile_assessment",
      targetRole: "data_analyst",
      scores: { aiTooling: 150, roleFoundation: 60, dataAnalysis: 70, businessProduct: 50, communication: 55, projectPractice: 45 },
      strengths: [],
      gaps: [],
      evidence: [],
      assumptions: [],
      needsConfirmation: true,
    });
    expect(parsed.success).toBe(false);
  });
});
