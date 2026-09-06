import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiResultFromResponse, extractAiExecutionMeta, fetchApi, readApiJson, requireApiOk } from "./client-api";

function jsonEnvelope(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("readApiJson", () => {
  it("returns the parsed envelope for JSON responses", async () => {
    expect(await readApiJson(jsonEnvelope({ ok: true, data: { id: "1" } }))).toEqual({ ok: true, data: { id: "1" } });
  });

  it("returns null for empty or non-JSON bodies", async () => {
    expect(await readApiJson(new Response("", { status: 500 }))).toBeNull();
    expect(await readApiJson(new Response("<html>oops</html>", { status: 502 }))).toBeNull();
  });
});

describe("apiResultFromResponse", () => {
  it("returns a success result with status for a 200 ok envelope", async () => {
    const result = await apiResultFromResponse<{ id: string }>(jsonEnvelope({ ok: true, data: { id: "c-1" } }, 200));
    expect(result).toMatchObject({ ok: true, status: 200, data: { id: "c-1" } });
  });

  it("treats a non-2xx HTTP status as failure with a classified code, not as success", async () => {
    const result = await apiResultFromResponse(jsonEnvelope({ ok: false, error: { code: "CONFLICT", message: "资料已变化" } }, 409));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error.code).toBe("CONFLICT");
      expect(result.error.message).toBe("资料已变化");
    }
  });

  it("maps HTTP statuses to default codes when the body lacks one", async () => {
    const cases: Array<[number, string]> = [
      [401, "UNAUTHORIZED"],
      [403, "FORBIDDEN"],
      [404, "NOT_FOUND"],
      [422, "INCOMPLETE_INPUT"],
      [429, "RATE_LIMITED"],
      [500, "SERVER_ERROR"],
    ];
    for (const [status, code] of cases) {
      const result = await apiResultFromResponse(new Response("", { status }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe(code);
    }
  });

  it("treats HTTP 200 with business failure as a failure, not success", async () => {
    const result = await apiResultFromResponse(new Response(JSON.stringify({ ok: false, error: { message: "校验失败" } }), { status: 200 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("校验失败");
  });

  it("normalizes an empty HTML error body to a friendly message", async () => {
    const result = await apiResultFromResponse(new Response("<html>bad gateway</html>", { status: 502 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("服务暂时不可用");
  });
});

describe("requireApiOk", () => {
  it("returns data for a successful envelope", async () => {
    expect(await requireApiOk<{ id: string }>(jsonEnvelope({ ok: true, data: { id: "x" } }, 200))).toEqual({ id: "x" });
  });

  it("throws an ApiError carrying status, code and requestId", async () => {
    let captured: ApiError | undefined;
    try {
      await requireApiOk<{ id: string }>(jsonEnvelope({ ok: false, error: { code: "CONFLICT", message: "资料已变化", requestId: "req-1" } }, 409));
    } catch (e) {
      captured = e as ApiError;
    }
    expect(captured).toBeInstanceOf(ApiError);
    expect(captured?.status).toBe(409);
    expect(captured?.code).toBe("CONFLICT");
    expect(captured?.requestId).toBe("req-1");
    expect(captured?.message).toBe("资料已变化");
  });

  it("uses a safe fallback message when the response is not JSON", async () => {
    let captured: ApiError | undefined;
    try {
      await requireApiOk(new Response("", { status: 500 }));
    } catch (e) {
      captured = e as ApiError;
    }
    expect(captured?.message).toContain("服务暂时不可用");
  });
});

describe("fetchApi", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns a success result for a 200 envelope", async () => {
    globalThis.fetch = vi.fn(async () => jsonEnvelope({ ok: true, data: { id: "1" } }, 200));
    const result = await fetchApi<{ id: string }>("/api/x");
    expect(result).toMatchObject({ ok: true, status: 200, data: { id: "1" } });
  });

  it("maps network failure to status 0 with a NETWORK_ERROR code (never treated as success)", async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError("fetch failed"); });
    const result = await fetchApi("/api/x");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(0);
      expect(result.error.code).toBe("NETWORK_ERROR");
    }
  });

  it("maps AbortError to a cancellation code, not a service error", async () => {
    globalThis.fetch = vi.fn(async () => { throw new DOMException("The operation was aborted", "AbortError"); });
    const result = await fetchApi("/api/x", { signal: new AbortController().signal });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ABORTED");
  });

  it("propagates a categorized 401 error without auto-replaying the mutation", async () => {
    globalThis.fetch = vi.fn(async () => jsonEnvelope({ ok: false, error: { message: "未登录" } }, 401));
    const result = await fetchApi("/api/x", { method: "POST" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNAUTHORIZED");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1); // 不因 401 自动重放请求
  });
});

describe("extractAiExecutionMeta", () => {
  it("returns AI execution meta from a nested aiExecution field", () => {
    const meta = { aiExecution: { requestedMode: "api" as const, actualMode: "api" as const, degraded: false, fallbackReason: null, source: "api" } };
    expect(extractAiExecutionMeta(meta)).not.toBeNull();
  });

  it("falls back to top-level legacy fields", () => {
    const meta = { requestedMode: "api" as const, actualMode: "mock" as const, degraded: true, fallbackReason: "timeout", source: "fallback" };
    expect(extractAiExecutionMeta(meta)).toMatchObject({ actualMode: "mock", degraded: true });
  });

  it("returns null when meta is absent or lacks AI execution info", () => {
    expect(extractAiExecutionMeta(undefined)).toBeNull();
    expect(extractAiExecutionMeta({ requestId: "r" })).toBeNull();
  });
});
