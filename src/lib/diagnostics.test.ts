import { describe, expect, it } from "vitest";
import { isMock, redactForDiagnostics, toDiagnosticLine } from "./diagnostics";

describe("diagnostics（T24：脱敏诊断与模式分离）", () => {
  it("redactForDiagnostics removes sensitive keys (password/token/message/content/body) even nested", () => {
    const out = redactForDiagnostics({
      requestId: "req-1",
      operation: "chat_stream",
      password: "secret",
      user: { token: "abc", name: "alice", message: "全文" },
      content: "should drop",
    });
    expect(out).toEqual({ requestId: "req-1", operation: "chat_stream", user: { name: "alice" } });
    expect(JSON.stringify(out)).not.toContain("secret");
    expect(JSON.stringify(out)).not.toContain("abc");
    expect(JSON.stringify(out)).not.toContain("全文");
  });

  it("truncates oversize strings to keep the log small", () => {
    const out = redactForDiagnostics({ note: "x".repeat(900) }) as { note: string };
    expect(out.note.length).toBeLessThanOrEqual(501);
  });

  it("toDiagnosticLine produces a compact single-line JSON without sensitive body", () => {
    const line = toDiagnosticLine({ requestId: "req-1", operation: "chat", elapsedMs: 123, mode: "api", degraded: false, errorCode: undefined });
    const parsed = JSON.parse(line);
    expect(parsed.requestId).toBe("req-1");
    expect(parsed.operation).toBe("chat");
    expect(parsed.mode).toBe("api");
    expect(parsed.elapsedMs).toBe(123);
    expect(parsed.degraded).toBe(false);
    expect(parsed).not.toHaveProperty("message");
    // 单行 JSONL，不包含换行
    expect(line).not.toContain("\n");
  });

  it("isMock separates mock from api records for real-latency stats", () => {
    expect(isMock("mock")).toBe(true);
    expect(isMock("api")).toBe(false);
    expect(isMock("manual")).toBe(false);
  });

  it("keeps errorCode so a failed request can be traced from the UI requestId", () => {
    const parsed = JSON.parse(toDiagnosticLine({ requestId: "req-9", operation: "chat", mode: "api", errorCode: "RATE_LIMITED" }));
    expect(parsed.errorCode).toBe("RATE_LIMITED");
    expect(parsed.requestId).toBe("req-9");
  });
});
