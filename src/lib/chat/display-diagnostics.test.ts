import { describe, expect, it } from "vitest";
import { describeChatWarnings, isInternalToolCitation } from "./display-diagnostics";

describe("chat diagnostic presentation", () => {
  it("deduplicates compatibility warnings and keeps them informational", () => {
    expect(describeChatWarnings(["UNKNOWN_EVENT", "UNKNOWN_EVENT; NORMALIZED_ARTIFACT_SCHEMA_VERSION"])).toMatchObject({ actionable: false, codes: ["UNKNOWN_EVENT", "NORMALIZED_ARTIFACT_SCHEMA_VERSION"] });
  });
  it("does not hide invalid business results as a compatibility notice", () => {
    const result = describeChatWarnings(["UNKNOWN_EVENT; INVALID_ARTIFACT_SCHEMA"]);
    expect(result.actionable).toBe(true);
    expect(result.message).toContain("未保存为有效业务结果");
  });
  it.each(['stdout:', 'Subtask 0 (画像评估) marked as done.', '{"artifact":{"data":{}}}', '[Skill: growth (sandbox execution)]'])('filters legacy tool output: %s', title => {
    expect(isInternalToolCitation(title)).toBe(true);
  });
  it("retains ordinary document titles", () => {
    expect(isInternalToolCitation("V2职业能力模板库")).toBe(false);
    expect(isInternalToolCitation("JSON 数据分析入门")).toBe(false);
  });
});
