import { describe, expect, it } from "vitest";
import { formatAiRuntimeBadge } from "./ai-runtime";

describe("formatAiRuntimeBadge", () => {
  it("shows the requested mode before an AI response is available", () => {
    expect(formatAiRuntimeBadge({ requestedMode: "manual" })).toBe("TBOX_MODE=manual");
  });

  it("shows actual mode and degradation after a fallback response", () => {
    expect(formatAiRuntimeBadge({ requestedMode: "api", actualMode: "mock", degraded: true })).toBe(
      "TBOX_MODE=api → mock（已降级）",
    );
  });
});
