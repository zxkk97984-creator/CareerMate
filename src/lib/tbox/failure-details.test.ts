import { describe, expect, it } from "vitest";
import { TboxError } from "./errors";
import { describeTboxFailure, withTboxFailureMeta, tboxFailureMessage } from "./failure-details";

describe("TBox failure details", () => {
  it("keeps safe provider details for a TboxError", () => {
    const error = new TboxError("http_error", "API_AUTH_FAILED", {
      httpStatus: 401,
    });

    expect(describeTboxFailure(error)).toEqual({
      code: "API_AUTH_FAILED",
      reason: "http_error",
      category: "auth",
      httpStatus: 401,
    });
  });

  it("preserves the generic fallback for unknown errors", () => {
    expect(describeTboxFailure(new Error("secret upstream response"))).toEqual({
      code: "TBOX_UNAVAILABLE",
      reason: "unknown",
      category: "unknown",
    });
  });

  it("preserves the existing aborted sentinel", () => {
    expect(describeTboxFailure(new Error("aborted"))).toEqual({
      code: "ABORTED",
      reason: "aborted",
      category: "aborted",
    });
  });

  it("merges failure details without copying the raw error message", () => {
    const meta = withTboxFailureMeta(
      { requestedMode: "api", actualMode: "api", source: "tbox-api" },
      new TboxError("provider_error", "PROVIDER_ERROR"),
    );

    expect(meta).toEqual({
      requestedMode: "api",
      actualMode: "api",
      source: "tbox-api",
      degraded: true,
      failure: {
        code: "PROVIDER_ERROR",
        reason: "provider_error",
        category: "provider",
      },
    });
    expect(JSON.stringify(meta)).not.toContain("secret");
  });
});

it("distinguishes cancelled requests from idle timeouts", () => {
  expect(tboxFailureMessage("ABORTED")).toContain("任务已中断");
  expect(tboxFailureMessage("TIMEOUT")).toContain("长时间没有返回数据");
});
