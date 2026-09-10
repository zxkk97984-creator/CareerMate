import { describe, expect, it } from "vitest";
import { workflowFailureCode } from "./workflow-diagnostics";
import { createAssistantResultAccumulator } from "./result";

describe("workflow failures", () => {
  it("retains a structured workflow failure even if normal reply text follows", () => {
    const acc = createAssistantResultAccumulator();
    acc.consume({ type: "tool_end", toolType: "subflow", toolId: "w1", resultSummary: JSON.stringify({ artifact: { status: "error", data: { code: "INVALID_JSON" } } }) });
    acc.consume({ type: "text_delta", text: "这里是一般建议" });
    expect(acc.finalize()).toMatchObject({ text: "这里是一般建议", warnings: ["INVALID_JSON"] });
  });
  it("does not classify mentions of errors in research text as workflow failures", () => {
    expect(workflowFailureCode("knowledge", '{"status":"error","data":{"code":"INVALID_JSON"}}')).toBeNull();
    expect(workflowFailureCode("subflow", "说明 INVALID_JSON 的意思")).toBeNull();
  });
});
