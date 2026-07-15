import { describe, expect, it, vi } from "vitest";
import { consumeChatResponse, requestRetrieval, sanitizeProbeResult, type SafeProbeResult } from "./client";
import type { TboxConfig } from "./types";

const baseConfig: TboxConfig = {
  mode: "api",
  apiKey: "secret",
  agentId: "agent-1",
  agentVersion: "2.0",
  searchEngine: false,
  retrievalMode: "agent",
  historyMode: "provider",
  contextTransport: "business_data",
  structuredMode: "terminal",
  reuseRemoteConversationId: false,
  chatEndpoint: "https://o.tbox.cn/openapi/v1/chat/create",
  retrieveEndpoint: "https://api.tbox.cn/api/datasets/retrieve",
  streamTimeoutMs: 90_000,
  probeAgentId: undefined,
  datasetIds: {
    roleCompetency: "",
    learningResources: "",
    simulationScenes: "",
    ethicsRules: "",
    careerTrends: "",
  },
};

describe("tbox client request contract", () => {
  it("sends conversation and agent options in the JSON body", async () => {
    const fetchFn = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      void url; void init;
      return new Response("{}", { status: 200 });
    });
    await consumeChatResponse(
      { question: "hello", userId: "user-1", conversationId: "remote-1" },
      true,
      {
        config: {
          mode: "api",
          apiKey: "secret",
          agentId: "agent-1",
          agentVersion: "2.0",
          searchEngine: false,
          retrievalMode: "agent",
          historyMode: "provider",
          contextTransport: "business_data",
          structuredMode: "terminal",
          reuseRemoteConversationId: false,
          chatEndpoint: "https://o.tbox.cn/openapi/v1/chat/create",
          retrieveEndpoint: "https://api.tbox.cn/api/datasets/retrieve",
          streamTimeoutMs: 90_000,
          probeAgentId: undefined,
          datasetIds: {
            roleCompetency: "",
            learningResources: "",
            simulationScenes: "",
            ethicsRules: "",
            careerTrends: "",
          },
        } as import("./types").TboxConfig,
        fetchImpl: fetchFn as typeof fetch,
      },
      async () => undefined,
    );
    const callArgs = fetchFn.mock.calls[0]!;
    const callUrl = callArgs[0]!;
    const callInit = callArgs[1];
    // conversation_id 不应出现在 URL 查询参数中
    expect(String(callUrl)).not.toContain("conversation_id");
    // 请求体应包含新字段
    const body = JSON.parse(String(callInit?.body));
    expect(body).toMatchObject({
      agent_id: "agent-1",
      agent_version: "2.0",
      conversation_id: "remote-1",
      search_engine: false,
      stream: true,
    });
  });

  it.each([
    [401, "API_AUTH_FAILED"],
    [403, "API_AUTH_FAILED"],
    [404, "AGENT_NOT_PUBLISHED"],
    [500, "PROVIDER_ERROR"],
  ] as const)("maps HTTP %i to the safe %s code", async (status, code) => {
    await expect(
      consumeChatResponse(
        { question: "hello", userId: "user-1" },
        false,
        {
          config: baseConfig,
          fetchImpl: vi.fn(async () => new Response(null, { status })),
        },
        async () => undefined,
      ),
    ).rejects.toMatchObject({ reason: "http_error", code });
  });

  it("maps missing chat configuration to API_CONFIG_MISSING", async () => {
    const fetchImpl = vi.fn();

    await expect(
      consumeChatResponse(
        { question: "hello", userId: "user-1" },
        false,
        { config: { ...baseConfig, apiKey: "" }, fetchImpl },
        async () => undefined,
      ),
    ).rejects.toMatchObject({ reason: "missing_config", code: "API_CONFIG_MISSING" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not mislabel a retrieval 404 as an unpublished Agent", async () => {
    await expect(
      requestRetrieval(
        { query: "SQL" },
        {
          config: baseConfig,
          fetchImpl: vi.fn(async () => new Response(null, { status: 404 })),
        },
      ),
    ).rejects.toMatchObject({ reason: "http_error", code: "PROVIDER_ERROR" });
  });

  it("maps missing retrieval configuration to API_CONFIG_MISSING", async () => {
    const fetchImpl = vi.fn();

    await expect(
      requestRetrieval(
        { query: "SQL" },
        { config: { ...baseConfig, retrieveEndpoint: "" }, fetchImpl },
      ),
    ).rejects.toMatchObject({ reason: "missing_config", code: "API_CONFIG_MISSING" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sanitizes a transport exception before a response is received", async () => {
    const privateMarker = "private-network-detail";
    const error = await consumeChatResponse(
      { question: "hello", userId: "user-1" },
      false,
      {
        config: baseConfig,
        fetchImpl: vi.fn(async () => {
          throw new Error(privateMarker);
        }),
      },
      async () => undefined,
    ).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ reason: "http_error", code: "PROVIDER_ERROR" });
    expect(String(error)).not.toContain(privateMarker);
  });

  it("sanitizes an exception while consuming a provider response", async () => {
    const privateMarker = "private-provider-detail";
    const error = await consumeChatResponse(
      { question: "hello", userId: "user-1" },
      false,
      {
        config: baseConfig,
        fetchImpl: vi.fn(async () => new Response(null, { status: 200 })),
      },
      async () => {
        throw new Error(privateMarker);
      },
    ).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ reason: "provider_error", code: "PROVIDER_ERROR" });
    expect(String(error)).not.toContain(privateMarker);
  });

  // ── 端点白名单安全测试 ─────────────────────────────

  it("rejects evil-tbox.cn (hostname suffix bypass attempt)", async () => {
    await expect(
      consumeChatResponse(
        { question: "hello", userId: "user-1" },
        false,
        {
          config: { ...baseConfig, chatEndpoint: "https://evil-tbox.cn/api/chat" },
          fetchImpl: vi.fn(),
        },
        async () => undefined,
      ),
    ).rejects.toMatchObject({ reason: "missing_config", code: "API_CONFIG_MISSING" });
  });

  it("rejects tbox.cn.evil.com (subdomain spoofing attempt)", async () => {
    await expect(
      consumeChatResponse(
        { question: "hello", userId: "user-1" },
        false,
        {
          config: { ...baseConfig, chatEndpoint: "https://tbox.cn.evil.com/api/chat" },
          fetchImpl: vi.fn(),
        },
        async () => undefined,
      ),
    ).rejects.toMatchObject({ reason: "missing_config", code: "API_CONFIG_MISSING" });
  });

  it("rejects non-https endpoints", async () => {
    await expect(
      consumeChatResponse(
        { question: "hello", userId: "user-1" },
        false,
        {
          config: { ...baseConfig, chatEndpoint: "http://o.tbox.cn/api/chat" },
          fetchImpl: vi.fn(),
        },
        async () => undefined,
      ),
    ).rejects.toMatchObject({ reason: "missing_config", code: "API_CONFIG_MISSING" });
  });

  it("allows sub.tbox.cn (valid subdomain)", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 200 }));
    await consumeChatResponse(
      { question: "hello", userId: "user-1" },
      false,
      {
        config: { ...baseConfig, chatEndpoint: "https://sub.tbox.cn/api/chat" },
        fetchImpl: fetchFn as typeof fetch,
      },
      async () => undefined,
    );
    expect(fetchFn).toHaveBeenCalled();
  });

  it("bypasses endpoint validation only when allowTestEndpoint is explicitly true", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 200 }));
    await consumeChatResponse(
      { question: "hello", userId: "user-1" },
      false,
      {
        config: { ...baseConfig, chatEndpoint: "https://not-tbox.example.com/api/chat" },
        fetchImpl: fetchFn as typeof fetch,
        allowTestEndpoint: true,
      },
      async () => undefined,
    );
    expect(fetchFn).toHaveBeenCalled();
  });

  it("rejects unknown endpoint without explicit allowTestEndpoint", async () => {
    await expect(
      consumeChatResponse(
        { question: "hello", userId: "user-1" },
        false,
        {
          config: { ...baseConfig, chatEndpoint: "https://not-tbox.example.com/api/chat" },
          fetchImpl: vi.fn(),
        },
        async () => undefined,
      ),
    ).rejects.toMatchObject({ reason: "missing_config", code: "API_CONFIG_MISSING" });
  });

  it("maps an internal request timeout to TIMEOUT", async () => {
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException("private timeout detail", "AbortError");
      return new Response(null, { status: 200 });
    });

    await expect(
      consumeChatResponse(
        { question: "hello", userId: "user-1" },
        false,
        {
          config: baseConfig,
          fetchImpl,
          clock: {
            setTimeout: (callback) => {
              callback();
              return 1 as unknown as ReturnType<typeof setTimeout>;
            },
            clearTimeout: vi.fn(),
          },
        },
        async () => undefined,
      ),
    ).rejects.toMatchObject({ reason: "timeout", code: "TIMEOUT" });
  });

  it("maps a caller abort to ABORTED", async () => {
    const caller = new AbortController();
    caller.abort();

    await expect(
      consumeChatResponse(
        { question: "hello", userId: "user-1" },
        false,
        {
          config: baseConfig,
          signal: caller.signal,
          fetchImpl: vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
            if (init?.signal?.aborted) throw new DOMException("private abort detail", "AbortError");
            return new Response(null, { status: 200 });
          }),
        },
        async () => undefined,
      ),
    ).rejects.toMatchObject({ reason: "aborted", code: "ABORTED" });
  });
});

// ── SafeProbeResult 脱敏报告 ─────────────────────────────

describe("SafeProbeResult sanitization", () => {
  it("produces only whitelisted fields in the safe report", () => {
    const result = sanitizeProbeResult({
      name: "basic_sse",
      status: "pass",
      httpOk: true,
      actualMode: "api",
      eventNames: ["conversation.chat.created", "conversation.message.delta", "conversation.chat.completed"],
      hasConversationId: true,
      hasText: true,
      hasStructuredResult: false,
      citationCount: 0,
      note: "正常",
      // 以下敏感字段不应出现在输出中
      prompt: "请用一句话介绍 CareerMate",
      authorization: "Bearer inc-akd-secret-token",
      fullPayload: { question: "请用一句话介绍 CareerMate", user_id: "probe-123" },
    } satisfies SafeProbeResult & { prompt?: string; authorization?: string; fullPayload?: unknown });

    // 白名单字段存在
    expect(result).toHaveProperty("name", "basic_sse");
    expect(result).toHaveProperty("status", "pass");
    expect(result).toHaveProperty("httpOk", true);
    expect(result).toHaveProperty("actualMode", "api");
    expect(result).toHaveProperty("eventNames");
    expect(result).toHaveProperty("hasConversationId", true);
    expect(result).toHaveProperty("hasText", true);
    expect(result).toHaveProperty("hasStructuredResult", false);
    expect(result).toHaveProperty("citationCount", 0);
    expect(result).toHaveProperty("note", "正常");

    // 敏感字段被剥离
    expect(result).not.toHaveProperty("prompt");
    expect(result).not.toHaveProperty("authorization");
    expect(result).not.toHaveProperty("fullPayload");
    expect(JSON.stringify(result)).not.toContain("inc-akd");
    expect(JSON.stringify(result)).not.toContain("Bearer");
  });

  it("marks probe as blocked when actualMode is not api", () => {
    const manual = sanitizeProbeResult({
      name: "basic_sse",
      status: "pass",
      httpOk: true,
      actualMode: "manual",
      eventNames: [],
      hasConversationId: false,
      hasText: true,
      hasStructuredResult: false,
      citationCount: 0,
      note: "使用了 fallback",
    } satisfies SafeProbeResult);

    expect(manual.status).toBe("blocked");
    expect(manual.note).toContain("manual");
  });

  it("marks mock as blocked", () => {
    const mock = sanitizeProbeResult({
      name: "basic_sse",
      status: "pass",
      httpOk: true,
      actualMode: "mock",
      eventNames: [],
      hasConversationId: false,
      hasText: true,
      hasStructuredResult: false,
      citationCount: 0,
      note: "",
    } satisfies SafeProbeResult);

    expect(mock.status).toBe("blocked");
  });

  it("preserves pass/fail for api-mode probes", () => {
    const pass = sanitizeProbeResult({
      name: "conversation_id",
      status: "pass",
      httpOk: true,
      actualMode: "api",
      eventNames: ["conversation.chat.created"],
      hasConversationId: true,
      hasText: true,
      hasStructuredResult: false,
      citationCount: 0,
      note: "连续三轮同一 ID",
    } satisfies SafeProbeResult);

    expect(pass.status).toBe("pass");

    const fail = sanitizeProbeResult({
      name: "history",
      status: "fail",
      httpOk: true,
      actualMode: "api",
      eventNames: ["conversation.chat.created", "conversation.message.delta"],
      hasConversationId: true,
      hasText: true,
      hasStructuredResult: false,
      citationCount: 0,
      note: "Agent 未能复述代号",
    } satisfies SafeProbeResult);

    expect(fail.status).toBe("fail");
  });

  it("returns empty eventNames array when none provided", () => {
    const result = sanitizeProbeResult({
      name: "context_size",
      status: "blocked",
      httpOk: false,
      actualMode: "api",
      eventNames: [],
      hasConversationId: false,
      hasText: false,
      hasStructuredResult: false,
      citationCount: 0,
      note: "请求超时",
    } satisfies SafeProbeResult);

    expect(Array.isArray(result.eventNames)).toBe(true);
    expect(result.eventNames).toHaveLength(0);
  });
});
