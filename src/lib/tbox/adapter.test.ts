import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { chatWithTbox, generateStructuredWithTbox } from "./adapter";
import type { TboxConfig } from "./types";

const baseConfig: TboxConfig = {
  mode: "api",
  apiKey: "test-api-key",
  agentId: "agent-1",
  searchEngine: false,
  retrievalMode: "agent",
  historyMode: "provider",
  contextTransport: "business_data",
  structuredMode: "terminal",
  chatEndpoint: "https://tbox.example/chat/create",
  retrieveEndpoint: "https://tbox.example/retrieve",
  streamTimeoutMs: 90_000,
  datasetIds: {
    roleCompetency: "dataset-role",
    learningResources: "dataset-learning",
    simulationScenes: "dataset-simulation",
    ethicsRules: "dataset-ethics",
    careerTrends: "",
  },
};

const valueSchema = z.object({ value: z.string() });

describe("Tbox fallback adapter", () => {
  it("reports API success metadata and follows the chat request protocol", async () => {
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => {
      void _url;
      void _init;
      return new Response(
        JSON.stringify({
          conversationId: "conversation-2",
          messages: [{ type: "answer", content_type: "text", content: "API answer" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await chatWithTbox(
      {
        question: "Next question",
        userId: "user-1",
        conversationId: "conversation-1",
        context: { targetRole: "data_analyst" },
      },
      { config: baseConfig, fetchImpl },
    );

    expect(result).toEqual({
      data: { text: "API answer", conversationId: "conversation-2", citations: [], warnings: [] },
      meta: {
        requestedMode: "api",
        actualMode: "api",
        degraded: false,
        fallbackReason: null,
        source: "tbox-api",
      },
    });
    const [url, init] = fetchImpl.mock.calls[0];
    // conversation_id 现在在请求体中，不在 URL 查询参数中
    expect(String(url)).toBe("https://tbox.example/chat/create");
    expect(init?.headers).toMatchObject({
      Authorization: "test-api-key",
      "Content-Type": "application/json",
    });
    expect(init?.headers).not.toHaveProperty("Accept");
    expect(JSON.parse(String(init?.body))).toEqual({
      agent_id: "agent-1",
      question: "Next question",
      user_id: "user-1",
      conversation_id: "conversation-1",
      search_engine: false,
      stream: false,
      business_data: JSON.stringify({ targetRole: "data_analyst" }),
    });
  });

  it.each([
    ["manual", async (): Promise<{ value: string }> => ({ value: "manual" }), "manual-fixture"],
    ["mock", async (): Promise<null> => null, "local-mock"],
  ] as const)("falls back from missing API credentials to %s", async (actualMode, manual, source) => {
    const result = await generateStructuredWithTbox({
      config: { ...baseConfig, apiKey: "" },
      userId: "user-1",
      prompt: "Return JSON",
      schema: valueSchema,
      manual,
      mock: () => ({ value: "mock" }),
      fetchImpl: vi.fn(),
    });

    expect(result.meta).toEqual({
      requestedMode: "api",
      actualMode,
      degraded: true,
      fallbackReason: "missing_config",
      source,
    });
    expect(result.data.value).toBe(actualMode);
  });

  it("falls back on malformed structured API output", async () => {
    const result = await generateStructuredWithTbox({
      config: baseConfig,
      userId: "user-1",
      prompt: "Return JSON",
      schema: valueSchema,
      manual: async () => ({ value: "manual" }),
      mock: () => ({ value: "mock" }),
      fetchImpl: vi.fn(async () =>
        new Response(
          JSON.stringify({
            conversation_id: "conversation-1",
            messages: [{ type: "answer", content_type: "text", content: "not-json" }],
          }),
          { status: 200 },
        ),
      ),
    });

    expect(result.data).toEqual({ value: "manual" });
    expect(result.meta).toMatchObject({
      requestedMode: "api",
      actualMode: "manual",
      degraded: true,
      fallbackReason: "validation_error",
    });
  });

  it("omits business_data when no context is supplied", async () => {
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => {
      void _url;
      void _init;
      return new Response(
        JSON.stringify({
          conversation_id: "conversation-1",
          messages: [{ type: "answer", content_type: "text", content: "answer" }],
        }),
        { status: 200 },
      );
    });

    await chatWithTbox(
      { question: "hello", userId: "user-1" },
      { config: baseConfig, fetchImpl },
    );

    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).not.toHaveProperty(
      "business_data",
    );
  });

  it("falls back on timeout using an injected clock", async () => {
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException("timed out", "AbortError");
      return new Response();
    });
    const setTimeoutFn = vi.fn((callback: () => void) => {
      callback();
      return 1 as unknown as ReturnType<typeof setTimeout>;
    });

    const result = await generateStructuredWithTbox({
      config: baseConfig,
      userId: "user-1",
      prompt: "Return JSON",
      schema: valueSchema,
      manual: async () => ({ value: "manual" }),
      mock: () => ({ value: "mock" }),
      fetchImpl,
      clock: { setTimeout: setTimeoutFn, clearTimeout: vi.fn() },
    });

    expect(result.data).toEqual({ value: "manual" });
    expect(result.meta.fallbackReason).toBe("timeout");
  });

  it("falls back from a missing manual fixture to mock", async () => {
    const result = await generateStructuredWithTbox({
      config: { ...baseConfig, mode: "manual" },
      userId: "user-1",
      prompt: "Return JSON",
      schema: valueSchema,
      manual: async () => null,
      mock: () => ({ value: "mock" }),
      fetchImpl: vi.fn(),
    });

    expect(result).toEqual({
      data: { value: "mock" },
      meta: {
        requestedMode: "manual",
        actualMode: "mock",
        degraded: true,
        fallbackReason: "manual_unavailable",
        source: "local-mock",
      },
    });
  });

  it("preserves a valid falsey value from a reusable structured schema", async () => {
    const result = await generateStructuredWithTbox({
      config: { ...baseConfig, mode: "manual" },
      userId: "user-1",
      prompt: "Return JSON",
      schema: z.boolean(),
      manual: async () => false,
      mock: () => true,
      fetchImpl: vi.fn(),
    });

    expect(result.data).toBe(false);
    expect(result.meta.actualMode).toBe("manual");
  });

  it("falls back to mock when a requested manual chat provider throws", async () => {
    const result = await chatWithTbox(
      { question: "hello", userId: "user-1" },
      {
        config: { ...baseConfig, mode: "manual" },
        manualChat: async () => {
          throw new Error("private manual failure");
        },
      },
    );

    expect(result.meta).toEqual({
      requestedMode: "manual",
      actualMode: "mock",
      degraded: true,
      fallbackReason: "manual_unavailable",
      source: "local-mock",
    });
    expect(JSON.stringify(result)).not.toContain("private manual failure");
  });

  it("falls back to mock when API and its manual fallback provider fail", async () => {
    const result = await chatWithTbox(
      { question: "hello", userId: "user-1" },
      {
        config: { ...baseConfig, apiKey: "" },
        manualChat: async () => {
          throw new Error("private manual failure");
        },
      },
    );

    expect(result.meta).toEqual({
      requestedMode: "api",
      actualMode: "mock",
      degraded: true,
      fallbackReason: "missing_config",
      source: "local-mock",
    });
    expect(JSON.stringify(result)).not.toContain("private manual failure");
  });

  it.each([
    ['```json\n[{"value":"first"},{"value":"second"}]\n```'],
    ['[{"value":"first"},{"value":"second"}]'],
  ])("extracts a complete top-level JSON array from %s output", async (answer) => {
    const result = await generateStructuredWithTbox({
      config: baseConfig,
      userId: "user-1",
      prompt: "Return JSON",
      schema: z.array(valueSchema),
      manual: async () => null,
      mock: () => [{ value: "mock" }],
      fetchImpl: vi.fn(async () =>
        new Response(
          JSON.stringify({
            conversation_id: "conversation-1",
            messages: [{ type: "answer", content_type: "text", content: answer }],
          }),
          { status: 200 },
        ),
      ),
    });

    expect(result.data).toEqual([{ value: "first" }, { value: "second" }]);
    expect(result.meta.actualMode).toBe("api");
  });
});
