import { afterEach, describe, expect, it, vi } from "vitest";
import { streamChatWithTbox, streamChatWithTboxProgressive } from "./streaming";
import type { TboxConfig } from "./types";

const config: TboxConfig = {
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

function sseResponse(content: string) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(content));
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

describe("stream chat orchestration", () => {
  it("normalizes an API stream and reports API metadata", async () => {
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => {
      void _url;
      void _init;
      return sseResponse(
        "event: conversation.chat.created\ndata: {\"data\":{\"conversation_id\":\"conversation-1\"}}\n\n" +
          "event: conversation.message.delta\ndata: {\"data\":{\"type\":\"answer\",\"content_type\":\"text\",\"content\":\"hello\"}}\n\n" +
          "event: done\ndata: [DONE]\n\n",
      );
    });

    const result = await streamChatWithTbox(
      { question: "hello", userId: "user-1" },
      { config, fetchImpl },
    );

    expect(fetchImpl.mock.calls[0][1]?.headers).toMatchObject({ Accept: "text/event-stream" });
    expect(result.meta).toEqual({
      requestedMode: "api",
      actualMode: "api",
      degraded: false,
      fallbackReason: null,
      source: "tbox-api",
    });
    expect(result.data.events).toEqual([
      { event: "message", data: { type: "delta", content: "hello" } },
      { event: "done", data: { conversationId: "conversation-1" } },
    ]);
  });

  it("preserves a final-only answer in the compatibility stream", async () => {
    const result = await streamChatWithTbox(
      { question: "hello", userId: "user-1" },
      {
        config,
        fetchImpl: vi.fn(async () =>
          sseResponse(
            'event: conversation.chat.completed\ndata: {"data":{"messages":[{"type":"answer","content_type":"text","content":"final answer"}]}}\n\n',
          ),
        ),
      },
    );

    expect(result.data.events).toEqual([
      { event: "message", data: { type: "delta", content: "final answer" } },
      { event: "done", data: { conversationId: null } },
    ]);
  });

  it("does not duplicate a completion final that echoes streamed deltas", async () => {
    const result = await streamChatWithTbox(
      { question: "hello", userId: "user-1" },
      {
        config,
        fetchImpl: vi.fn(async () =>
          sseResponse(
            'event: conversation.message.delta\ndata: {"data":{"type":"answer","content_type":"text","content":"complete answer"}}\n\n' +
              'event: conversation.chat.completed\ndata: {"data":{"messages":[{"type":"answer","content_type":"text","content":"complete answer"}]}}\n\n',
          ),
        ),
      },
    );

    expect(result.data.events).toEqual([
      { event: "message", data: { type: "delta", content: "complete answer" } },
      { event: "done", data: { conversationId: null } },
    ]);
  });

  it("preserves PROVIDER_ERROR as the fallback reason after chat failure", async () => {
    const privateMarker = "private-provider-payload";
    const result = await streamChatWithTbox(
      { question: "hello", userId: "user-1" },
      {
        config,
        fetchImpl: vi.fn(async () =>
          sseResponse(
            `event: conversation.chat.failed\ndata: ${JSON.stringify({
              event: "conversation.chat.failed",
              data: { message: privateMarker },
            })}\n\n`,
          ),
        ),
        manualChat: async () => "safe fallback",
      },
    );

    expect(result.meta).toMatchObject({
      actualMode: "manual",
      degraded: true,
      fallbackReason: "provider_error",
    });
    expect(JSON.stringify(result)).not.toContain(privateMarker);
  });

  it("degrades after agentic_error completes without text or structured output", async () => {
    const privateMarker = "private-agent-diagnostic";
    const manualChat = vi.fn(async () => "safe fallback");
    const result = await streamChatWithTbox(
      { question: "hello", userId: "user-1" },
      {
        config,
        fetchImpl: vi.fn(async () =>
          sseResponse(
            `event: conversation.message.delta\ndata: ${JSON.stringify({
              event: "conversation.message.delta",
              data: { type: "agentic_error", content: privateMarker },
            })}\n\nevent: done\ndata: [DONE]\n\n`,
          ),
        ),
        manualChat,
      },
    );

    expect(result.meta).toMatchObject({
      actualMode: "manual",
      degraded: true,
      fallbackReason: "invalid_response",
    });
    expect(result.data.events).toEqual([
      { event: "message", data: { type: "delta", content: "safe fallback" } },
      { event: "done", data: { conversationId: null } },
    ]);
    expect(manualChat).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain(privateMarker);
  });

  it("does not append a fallback after progressive API text was already emitted", async () => {
    const emitted: unknown[] = [];
    const privateMarker = "private-provider-payload";

    const pending = streamChatWithTboxProgressive(
      { question: "hello", userId: "user-1" },
      {
        config,
        fetchImpl: vi.fn(async () =>
          sseResponse(
            'event: conversation.message.delta\ndata: {"data":{"type":"answer","content_type":"text","content":"partial API answer"}}\n\n' +
              `event: conversation.chat.failed\ndata: ${JSON.stringify({
                event: "conversation.chat.failed",
                data: { message: privateMarker },
              })}\n\n`,
          ),
        ),
        manualChat: async () => "safe fallback",
      },
      (event) => emitted.push(event),
    );

    await expect(pending).rejects.toMatchObject({
      reason: "provider_error",
      code: "PROVIDER_ERROR",
    });
    expect(emitted).toEqual([
      expect.objectContaining({
        event: "message",
        data: { type: "delta", content: "partial API answer" },
      }),
    ]);
    expect(JSON.stringify(emitted)).not.toContain(privateMarker);
    expect(JSON.stringify(emitted)).not.toContain("safe fallback");
  });

  it("rejects progressive EOF after text when no done event was received", async () => {
    const emitted: unknown[] = [];
    const manualChat = vi.fn(async () => "safe fallback");
    const pending = streamChatWithTboxProgressive(
      { question: "hello", userId: "user-1" },
      {
        config,
        fetchImpl: vi.fn(async () =>
          sseResponse(
            'event: conversation.message.delta\ndata: {"data":{"type":"answer","content_type":"text","content":"partial API answer"}}\n\n',
          ),
        ),
        manualChat,
      },
      (event) => emitted.push(event),
    );

    await expect(pending).rejects.toMatchObject({
      reason: "sse_error",
      code: "SSE_PARSE_FAILED",
    });
    expect(emitted).toEqual([
      expect.objectContaining({
        event: "message",
        data: { type: "delta", content: "partial API answer" },
      }),
    ]);
    expect(manualChat).not.toHaveBeenCalled();
  });

  it("falls back to manual events after malformed upstream SSE", async () => {
    const result = await streamChatWithTbox(
      { question: "hello", userId: "user-1" },
      {
        config,
        fetchImpl: vi.fn(async () => sseResponse("event: conversation.message.delta\ndata: {bad\n\n")),
        manualChat: async () => "manual answer",
      },
    );

    expect(result.meta).toMatchObject({
      requestedMode: "api",
      actualMode: "manual",
      degraded: true,
      fallbackReason: "sse_error",
      source: "manual-fixture",
    });
    expect(result.data.events).toEqual([
      { event: "message", data: { type: "delta", content: "manual answer" } },
      { event: "done", data: { conversationId: null } },
    ]);
  });

  it("keeps the AbortController timeout active while consuming the stream body", async () => {
    vi.useFakeTimers();
    const timedConfig = { ...config, streamTimeoutMs: 10 };
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener("abort", () => {
              controller.error(new DOMException("timed out", "AbortError"));
            });
            setTimeout(() => {
              if (!init?.signal?.aborted) {
                controller.enqueue(
                  encoder.encode("event: done\ndata: [DONE]\n\n"),
                );
                controller.close();
              }
            }, 100);
          },
        }),
        { status: 200 },
      );
    });

    const pending = streamChatWithTbox(
      { question: "hello", userId: "user-1" },
      { config: timedConfig, fetchImpl, manualChat: async () => "manual answer" },
    );
    await vi.advanceTimersByTimeAsync(110);
    const result = await pending;

    expect(result.meta).toMatchObject({ actualMode: "manual", fallbackReason: "timeout" });
  });

  it("treats the stream timeout as an idle timeout", async () => {
    vi.useFakeTimers();
    const timedConfig = { ...config, streamTimeoutMs: 10 };
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener("abort", () =>
              controller.error(new DOMException("aborted", "AbortError")),
            );
            setTimeout(() => controller.enqueue(encoder.encode("event: conversation.chat.created\ndata: {\"data\":{}}\n\n")), 5);
            setTimeout(() => controller.enqueue(encoder.encode("event: conversation.chat.in_progress\ndata: {\"data\":{}}\n\n")), 13);
            setTimeout(() => controller.enqueue(encoder.encode(
              'event: conversation.message.delta\ndata: {"data":{"type":"answer","content_type":"text","content":"answer"}}\n\n',
            )), 17);
            setTimeout(() => controller.enqueue(encoder.encode("event: done\ndata: [DONE]\n\n")), 21);
          },
        }),
        { status: 200 },
      );
    });

    const pending = streamChatWithTbox(
      { question: "hello", userId: "user-1" },
      { config: timedConfig, fetchImpl },
    );
    await vi.advanceTimersByTimeAsync(25);
    const result = await pending;
    expect(result.meta.actualMode).toBe("api");
  });

  it("does not start a fallback after the downstream request aborts", async () => {
    const requestController = new AbortController();
    const manualChat = vi.fn(async () => "manual answer");
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      return new Response(
        new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener("abort", () =>
              controller.error(new DOMException("aborted", "AbortError")),
            );
          },
        }),
        { status: 200 },
      );
    });

    const pending = streamChatWithTbox(
      { question: "hello", userId: "user-1" },
      { config, fetchImpl, manualChat, signal: requestController.signal },
    );
    requestController.abort();
    await expect(pending).rejects.toMatchObject({ reason: "aborted", code: "ABORTED" });
    expect(manualChat).not.toHaveBeenCalled();
  });

  it("does not start local work when the request was aborted before transport", async () => {
    const requestController = new AbortController();
    requestController.abort();
    const manualChat = vi.fn(async () => "manual answer");

    await expect(
      streamChatWithTbox(
        { question: "hello", userId: "user-1" },
        {
          config: { ...config, apiKey: "" },
          manualChat,
          signal: requestController.signal,
        },
      ),
    ).rejects.toMatchObject({ reason: "aborted", code: "ABORTED" });
    expect(manualChat).not.toHaveBeenCalled();
  });

  it("falls back to mock when a requested manual stream provider throws", async () => {
    const result = await streamChatWithTbox(
      { question: "hello", userId: "user-1" },
      {
        config: { ...config, mode: "manual" },
        manualChat: async () => {
          throw new Error("private stream failure");
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
    expect(JSON.stringify(result)).not.toContain("private stream failure");
  });

  it("falls back to mock when API and its manual stream fallback provider fail", async () => {
    const result = await streamChatWithTbox(
      { question: "hello", userId: "user-1" },
      {
        config: { ...config, apiKey: "" },
        manualChat: async () => {
          throw new Error("private stream failure");
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
    expect(JSON.stringify(result)).not.toContain("private stream failure");
  });
});

afterEach(() => {
  vi.useRealTimers();
});
