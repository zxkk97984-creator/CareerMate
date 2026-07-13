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

  it("stops and cancels the upstream reader after a terminal event", async () => {
    const encoder = new TextEncoder();
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("event: done\ndata: [DONE]\n\n"));
      },
      cancel() {
        canceled = true;
      },
    });

    expect(await collect(stream)).toEqual([
      { event: "done", data: { conversationId: null } },
    ]);
    expect(canceled).toBe(true);
  });

  it("cancels the upstream reader after malformed data", async () => {
    const encoder = new TextEncoder();
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("event: message\ndata: {bad\n\n"));
      },
      cancel() {
        canceled = true;
      },
    });

    const events = await collect(stream);
    expect(events[0]?.event).toBe("error");
    expect(canceled).toBe(true);
  });

  // ── Task 1: 新增协议基线测试 ────────────────────────────

  it("preserves plain-text data as a final answer", async () => {
    const events = await collect(chunkedStream([
      "event: conversation.chat.completed\ndata: 最终 Markdown 回答\n\n",
      "event: done\ndata: [DONE]\n\n",
    ]));
    // 当前实现会因非 JSON data 而报 error，预期改为 text_final
    expect(events).toContainEqual({ type: "text_final", text: "最终 Markdown 回答" });
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("extracts a variable result from the completion payload", async () => {
    const events = await collect(chunkedStream([
      'event: conversation.chat.completed\ndata: {"data":{"conversation_id":"remote-1","variables":{"result":{"type":"role_match","matches":[]}}}}\n\n',
    ]));
    expect(events).toContainEqual({ type: "conversation", conversationId: "remote-1" });
    expect(events).toContainEqual({
      type: "structured_result",
      payload: { type: "role_match", matches: [] },
    });
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("does not fail on an unknown non-terminal event", async () => {
    const events = await collect(chunkedStream([
      'event: workflow.node.started\ndata: {"data":{"name":"技能评估Agent"}}\n\n',
      'event: conversation.message.delta\ndata: {"data":{"type":"answer","content_type":"text","content":"继续回答"}}\n\n',
      "event: done\ndata: [DONE]\n\n",
    ]));
    expect(events).toContainEqual({ type: "text_delta", text: "继续回答" });
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("finalizes once when a completion event is the terminal event", async () => {
    const events = await collect(chunkedStream([
      'event: conversation.chat.completed\ndata: {"data":{"conversation_id":"remote-2","messages":[{"type":"answer","content_type":"text","content":"完成"}]}}\n\n',
    ]));
    expect(events.filter((event) => (event as { type: string }).type === "done")).toHaveLength(1);
    expect(events).toContainEqual({ type: "text_final", text: "完成" });
  });

  it("does not wait forever for an underlying cancel promise", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("event: done\ndata: [DONE]\n\n"));
      },
      cancel() {
        return new Promise<void>(() => undefined);
      },
    });
    const outcome = await Promise.race([
      collect(stream),
      new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 50)),
    ]);
    expect(outcome).not.toBe("hung");
  });
});
