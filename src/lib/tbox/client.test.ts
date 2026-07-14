import { describe, expect, it, vi } from "vitest";
import { consumeChatResponse, requestRetrieval } from "./client";
import type { TboxConfig } from "./types";

const baseConfig: TboxConfig = {
  mode: "api",
  apiKey: "secret",
  agentId: "agent-1",
  agentVersion: "2.0",
  searchEngine: false,
  retrievalMode: "agent",
  chatEndpoint: "https://o.tbox.cn/openapi/v1/chat/create",
  retrieveEndpoint: "https://api.tbox.cn/api/datasets/retrieve",
  streamTimeoutMs: 90_000,
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
          chatEndpoint: "https://o.tbox.cn/openapi/v1/chat/create",
          retrieveEndpoint: "https://api.tbox.cn/api/datasets/retrieve",
          streamTimeoutMs: 90_000,
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
