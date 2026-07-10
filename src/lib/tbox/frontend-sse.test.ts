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
        () => undefined,
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
        () => undefined,
      ),
    ).rejects.toThrow("服务不可用");
  });

  it("collects deltas and requires a terminal done event", async () => {
    const deltas: string[] = [];
    await consumeFrontendSseResponse(
      new Response(
        'event: message\ndata: {"type":"delta","content":"hello"}\n\n' +
          'event: done\ndata: {"conversationId":"c1"}\n\n',
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
      (content) => deltas.push(content),
    );
    expect(deltas).toEqual(["hello"]);

    await expect(
      consumeFrontendSseResponse(
        new Response('event: message\ndata: {bad}\n\n', {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
        () => undefined,
      ),
    ).rejects.toThrow("流式响应格式无效");
  });
});
