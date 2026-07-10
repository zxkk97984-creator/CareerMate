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

    const configuredOnly = recoverAiRuntime("api", conversation);
    expect(configuredOnly).toEqual({
      requestedMode: "api",
      actualMode: "api",
      degraded: false,
      fallbackReason: null,
      source: "configured-no-execution",
    });
    expect(formatAiRuntimeBadge(configuredOnly)).toBe("TBOX_MODE=api（尚未执行）");
    expect(formatAiRuntimeDescription(configuredOnly)).toBe("配置 api · 尚未执行");
    expect(formatAiRuntimeDescription(configuredOnly)).not.toContain("实际");
    expect(recoverAiRuntime("manual", conversation)).toEqual({
      requestedMode: "manual",
      actualMode: "manual",
      degraded: false,
      fallbackReason: null,
      source: "manual-fixture",
    });
  });

  it("shows a fresh runtime and invalid persisted execution as pending", () => {
    const fresh = recoverAiRuntime("api", null);
    const invalid = recoverAiRuntime("manual", {
      requestedMode: "manual",
      actualMode: "manual",
      transcript: JSON.stringify([{ role: "assistant", meta: { source: "missing-fields" } }]),
    });

    for (const runtime of [fresh, invalid]) {
      expect(runtime.source).toBe("configured-no-execution");
      expect(formatAiRuntimeBadge(runtime)).toContain("尚未执行");
      expect(formatAiRuntimeDescription(runtime)).toContain("尚未执行");
    }
  });
});
