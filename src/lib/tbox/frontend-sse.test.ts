import { describe, expect, it } from "vitest";
import { consumeFrontendSseResponse, parseFrontendSseBlock } from "./frontend-sse";

describe("frontend SSE parsing", () => {
  it("reads canonical named SSE events", () => {
    expect(
      parseFrontendSseBlock(
        'event: message\ndata: {"type":"delta","content":"hello"}',
      ),
    ).toEqual({
      event: "message",
      data: { type: "delta", content: "hello" },
    });
  });

  it("keeps data-only message compatibility", () => {
    expect(
      parseFrontendSseBlock('data: {"type":"delta","content":"legacy"}'),
    ).toEqual({
      event: "message",
      data: { type: "delta", content: "legacy" },
    });
  });
});

describe("frontend SSE response consumption", () => {
  it("rejects non-SSE HTTP errors", async () => {
    await expect(
      consumeFrontendSseResponse(
        new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
        { onDelta: () => undefined },
      ),
    ).rejects.toThrow("对话请求失败");
  });

  it("rejects named error events", async () => {
    await expect(
      consumeFrontendSseResponse(
        new Response('event: error\ndata: {"type":"error","message":"服务不可用"}\n\n', {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
        { onDelta: () => undefined },
      ),
    ).rejects.toThrow("服务不可用");
  });

  it("collects deltas and requires a terminal done event", async () => {
    const deltas: string[] = [];
    const contexts: Array<Record<string, unknown>> = [];
    const meta = {
      requestedMode: "api",
      actualMode: "api",
      degraded: false,
      fallbackReason: null,
      source: "tbox-api",
    };
    const result = await consumeFrontendSseResponse(
      new Response(
        'event: context\ndata: {"intent":"roleCompetency","usedProfile":true,"usedPlan":true,"usedMemoryCount":1,"knowledgeSources":["role-ai-product-manager"],"retrievalMeta":null}\n\n' +
          `event: message\ndata: ${JSON.stringify({ type: "delta", content: "hel", meta })}\n\n` +
          `event: message\ndata: ${JSON.stringify({ type: "delta", content: "lo", meta })}\n\n` +
          `event: done\ndata: ${JSON.stringify({ conversationId: "c1", meta })}\n\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
      {
        onDelta: (content) => deltas.push(content),
        onContext: (context) => contexts.push(context as unknown as Record<string, unknown>),
      },
    );
    expect(deltas.join("")).toBe("hello");
    expect(contexts[0]).toMatchObject({
      intent: "roleCompetency",
      knowledgeSources: ["role-ai-product-manager"],
    });
    expect(result).toEqual({ conversationId: "c1", meta });

    await expect(
      consumeFrontendSseResponse(
        new Response('event: message\ndata: {bad}\n\n', {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
        { onDelta: () => undefined },
      ),
    ).rejects.toThrow("流式响应格式无效");

    await expect(
      consumeFrontendSseResponse(
        new Response('event: message\ndata: {"type":"delta","content":"unfinished"}\n\n', {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
        { onDelta: () => undefined },
      ),
    ).rejects.toThrow("流式响应未正常结束");
  });

  it("does not block UI cleanup on an unsettled cancel promise", async () => {
    const encoder = new TextEncoder();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode('event: done\ndata: {"conversationId":"c1"}\n\n'),
          );
        },
        cancel() {
          return new Promise<void>(() => undefined);
        },
      }),
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    );
    const outcome = await Promise.race([
      consumeFrontendSseResponse(response, { onDelta: () => undefined }).then(
        () => "done" as const,
      ),
      new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 50)),
    ]);
    expect(outcome).toBe("done");
  });
});
