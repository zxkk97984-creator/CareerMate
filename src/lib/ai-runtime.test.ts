import { describe, expect, it } from "vitest";
import {
  formatAiRuntimeBadge,
  formatAiRuntimeDescription,
  recoverAiRuntime,
} from "./ai-runtime";

describe("formatAiRuntimeBadge", () => {
  it("shows the requested mode before an AI response is available", () => {
    expect(formatAiRuntimeBadge({ requestedMode: "manual" })).toBe("TBOX_MODE=manual");
  });

  it("shows actual mode and degradation after a fallback response", () => {
    expect(formatAiRuntimeBadge({ requestedMode: "api", actualMode: "mock", degraded: true })).toBe(
      "TBOX_MODE=api → mock（已降级）",
    );
  });

  it("provides dynamic requested and actual mode wording for companion surfaces", () => {
    expect(
      formatAiRuntimeDescription({ requestedMode: "api", actualMode: "mock", degraded: true }),
    ).toBe("请求 api · 实际 mock · 已降级");
    expect(
      formatAiRuntimeDescription({ requestedMode: "manual", actualMode: "manual", degraded: false }),
    ).toBe("请求 manual · 实际 manual");
  });

  it("does not splice a previous manual execution into a newly configured api mode", () => {
    const conversation = {
      requestedMode: "manual",
      actualMode: "manual",
      transcript: JSON.stringify([
        {
          role: "assistant",
          meta: {
            requestedMode: "manual",
            actualMode: "manual",
            degraded: false,
            fallbackReason: null,
            source: "manual-fixture",
          },
        },
      ]),
    };

    expect(recoverAiRuntime("api", conversation)).toEqual({
      requestedMode: "api",
      actualMode: "api",
      degraded: false,
      fallbackReason: null,
      source: "configured-no-execution",
    });
    expect(recoverAiRuntime("manual", conversation)).toEqual({
      requestedMode: "manual",
      actualMode: "manual",
      degraded: false,
      fallbackReason: null,
      source: "manual-fixture",
    });
  });
});
