import { describe, expect, it } from "vitest";
import { parseUpstreamSse } from "./sse";

function chunkedStream(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const events = [];
  for await (const event of parseUpstreamSse(stream)) events.push(event);
  return events;
}

describe("upstream SSE normalization", () => {
  it("handles split chunks and CRLF while forwarding only answer text deltas", async () => {
    const events = await collect(
      chunkedStream([
        "event: conversation.chat.created\r\ndata: {\"event\":\"conversation.chat.created\",\"data\":{\"conversation_",
        "id\":\"conversation-1\"}}\r\n\r\nevent: conversation.message.delta\r\ndata: {\"event\":\"conversation.message.delta\",\"data\":{\"type\":\"answer\",\"content_type\":\"text\",\"content\":\"你",
        "好\"}}\r\n\r\nevent: conversation.message.delta\r\ndata: {\"event\":\"conversation.message.delta\",\"data\":{\"type\":\"reasoning\",\"content_type\":\"text\",\"content\":\"private\"}}\r\n\r\n",
        "event: conversation.message.delta\ndata: {\"data\":{\"type\":\"answer\",\"content_type\":\"image\",\"content\":\"ignored\"}}\n\nevent: conversation.chat.completed\ndata: {\"event\":\"conversation.chat.completed\",\"data\":{}}",
      ]),
    );

    expect(events).toEqual([
      { event: "message", data: { type: "delta", content: "你好" } },
      { event: "done", data: { conversationId: "conversation-1" } },
    ]);
  });

  it("normalizes malformed JSON to a safe error without echoing upstream data", async () => {
    const privateMarker = "private-upstream-value";
    const events = await collect(
      chunkedStream([
        `event: conversation.message.delta\ndata: {\"diagnostic\":\"${privateMarker}\"\n\n`,
      ]),
    );

    expect(events).toEqual([
      {
        event: "error",
        data: { type: "error", message: "百宝箱流式响应格式无效" },
      },
    ]);
    expect(JSON.stringify(events)).not.toContain(privateMarker);
  });

  it("handles a CRLF delimiter split across byte chunks", async () => {
    const events = await collect(
      chunkedStream([
        "event: conversation.message.delta\r",
        "\ndata: {\"data\":{\"type\":\"answer\",\"content_type\":\"text\",\"content\":\"split\"}}\r",
        "\n\r",
        "\nevent: done\r\ndata: [DONE]\r\n\r\n",
      ]),
    );

    expect(events).toEqual([
      { event: "message", data: { type: "delta", content: "split" } },
      { event: "done", data: { conversationId: null } },
    ]);
  });
});
