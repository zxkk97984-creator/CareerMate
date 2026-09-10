import { describe, expect, it } from "vitest";
import { createArtifactStreamFilter } from "./artifact-stream-filter";

const open = "<CAREERMATE_ARTIFACT>";
const close = "</CAREERMATE_ARTIFACT>";

function run(chunks: string[]): { text: string; warnings: string[] } {
  const filter = createArtifactStreamFilter();
  let text = "";
  for (const chunk of chunks) text += filter.push(chunk);
  const result = filter.finish();
  return { text: text + result.text, warnings: result.warnings };
}

describe("artifact stream filter", () => {
  it("streams text before and after a complete envelope", () => {
    const result = run(["结论如下。", `${open}{"taskType":"career_plan"}`, close, "请确认。"]);
    expect(result.text).toBe("结论如下。请确认。");
    expect(result.warnings).toEqual([]);
  });

  it("handles tags split across arbitrary chunks and unicode", () => {
    const result = run([
      "你好🙂<CAREER",
      "MATE_ART",
      "IFACT>{\"summary\":\"私密候选\"}</CAREERMATE_",
      "ARTIFACT>世界",
    ]);
    expect(result.text).toBe("你好🙂世界");
    expect(result.text).not.toContain("私密候选");
  });

  it("does not leak an unclosed envelope", () => {
    const result = run(["正文", `${open}{"secret":"不能显示"}`]);
    expect(result.text).toBe("正文");
    expect(result.warnings).toContain("INVALID_ARTIFACT_ENVELOPE");
  });

  it("strips every envelope when multiple are present", () => {
    const result = run([
      "前文",
      `${open}{"one":1}${close}中间${open}{"two":2}${close}`,
      "后文",
    ]);
    expect(result.text).toBe("前文中间后文");
    expect(result.text).not.toContain("\"one\"");
    expect(result.text).not.toContain("\"two\"");
    expect(result.warnings).toContain("MULTIPLE_ARTIFACT_ENVELOPES");
  });

  it("returns a literal partial tag at finish without inventing an envelope", () => {
    const result = run(["普通文本 <CAREER"]);
    expect(result.text).toBe("普通文本 <CAREER");
    expect(result.warnings).toEqual([]);
  });
});
