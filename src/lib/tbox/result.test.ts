import { describe, expect, it } from "vitest";
import { createAssistantResultAccumulator } from "./result";

describe("assistant result accumulator", () => {
  it("does not append a final that equals accumulated deltas", () => {
    const result = createAssistantResultAccumulator();
    expect(result.consume({ type: "text_delta", text: "你好" })).toBe("你好");
    expect(result.consume({ type: "text_final", text: "你好" })).toBe("");
    expect(result.finalize().text).toBe("你好");
  });

  it("emits only the missing suffix when final extends deltas", () => {
    const result = createAssistantResultAccumulator();
    result.consume({ type: "text_delta", text: "职业建议" });
    expect(result.consume({ type: "text_final", text: "职业建议如下" })).toBe("如下");
    expect(result.finalize().text).toBe("职业建议如下");
  });

  it("keeps semantically different final text", () => {
    const result = createAssistantResultAccumulator();
    result.consume({ type: "text_final", text: "第一部分" });
    expect(result.consume({ type: "text_final", text: "第二部分" })).toBe("\n\n第二部分");
    expect(result.finalize().text).toBe("第一部分\n\n第二部分");
  });

  it("keeps the most complete duplicate and records a warning", () => {
    const result = createAssistantResultAccumulator();
    result.consume({ type: "text_final", text: "完整回答" });
    result.consume({ type: "text_final", text: "完整回答" });
    expect(result.finalize()).toMatchObject({
      text: "完整回答",
      warnings: ["DUPLICATE_RESPONSE"],
    });
  });
});
