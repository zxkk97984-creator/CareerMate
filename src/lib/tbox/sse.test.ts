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

    // 现在返回 NormalizedAiEvent 格式
    expect(events).toContainEqual({ type: "text_delta", text: "你好" });
    // conversation.chat.created 提取 conversation ID
    expect(events).toContainEqual({ type: "conversation", conversationId: "conversation-1" });
    // 最终有 done 事件
    expect(events[events.length - 1]).toEqual({ type: "done" });
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

    expect(events).toContainEqual({ type: "text_delta", text: "split" });
    expect(events[events.length - 1]).toEqual({ type: "done" });
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
      { type: "done" },
    ]);
    expect(canceled).toBe(true);
  });

  it("treats malformed JSON (starts with { or [) as a safe error", async () => {
    const privateMarker = "private-upstream-value";
    const events = await collect(
      chunkedStream([
        `event: conversation.message.delta\ndata: {\"diagnostic\":\"${privateMarker}\"\n\n`,
      ]),
    );

    // 损坏的 JSON（以 { 开头但无法解析）→ 安全 error
    expect(events[0]?.type).toBe("error");
    expect(events[0]).toMatchObject({ code: "SSE_PARSE_FAILED" });
    expect(JSON.stringify(events)).not.toContain(privateMarker);
  });

  it("never forwards agentic_error content as assistant text", async () => {
    const privateMarker = "private-agent-diagnostic";
    const events = await collect(
      chunkedStream([
        `event: conversation.message.delta\ndata: ${JSON.stringify({
          event: "conversation.message.delta",
          data: { type: "agentic_error", content: privateMarker },
        })}\n\n`,
      ]),
    );

    expect(events).toEqual([{ type: "warning", code: "AGENT_ERROR" }]);
    expect(JSON.stringify(events)).not.toContain(privateMarker);
  });

  it("normalizes conversation.chat.failed without exposing provider payload", async () => {
    const privateMarker = "private-provider-payload";
    const events = await collect(
      chunkedStream([
        `event: conversation.chat.failed\ndata: ${JSON.stringify({
          event: "conversation.chat.failed",
          data: { message: privateMarker },
        })}\n\n`,
      ]),
    );

    expect(events).toEqual([
      {
        type: "error",
        code: "PROVIDER_ERROR",
        message: "百宝箱 Agent 执行失败，请稍后重试。",
      },
    ]);
    expect(JSON.stringify(events)).not.toContain(privateMarker);
  });

  // ── Task 1/4: 新协议基线测试（现在应该通过）──────────

  it("preserves plain-text data as a final answer", async () => {
    const events = await collect(chunkedStream([
      "event: conversation.chat.completed\ndata: 最终 Markdown 回答\n\n",
      "event: done\ndata: [DONE]\n\n",
    ]));
    expect(events).toContainEqual({ type: "text_final", text: "最终 Markdown 回答" });
    expect(events[events.length - 1]).toEqual({ type: "done" });
  });

  it("completion event ends with done（真实 API 无 variables.result）", async () => {
    const events = await collect(chunkedStream([
      'event: conversation.chat.completed\ndata: {"conversation_id":"remote-1","status":"completed"}\n\n',
    ]));
    expect(events).toContainEqual({ type: "conversation", conversationId: "remote-1" });
    // 真实 API 的 completed 事件不包含 structured_result/variables.result
    expect(events.filter((e) => (e as any).type === "structured_result")).toHaveLength(0);
    expect(events[events.length - 1]).toEqual({ type: "done" });
  });

  it("handles agentic_tool_start and agentic_tool_end events（真实 API 格式）", async () => {
    const events = await collect(chunkedStream([
      'event: conversation.message.delta\ndata: {"role":"assistant","content_type":"object_string","type":"agentic_tool_start","content":"{\\"toolType\\":\\"knowledge\\",\\"toolId\\":\\"call_123\\",\\"toolDescription\\":\\"查询知识库\\"}"}\n\n',
      'event: conversation.message.delta\ndata: {"role":"assistant","content_type":"object_string","type":"agentic_tool_end","content":"{\\"toolType\\":\\"knowledge\\",\\"toolId\\":\\"call_123\\",\\"resultSummary\\":\\"[参考资料 1] (相关度: 0.80)\\\\nDBA技能要求\\",\\"toolDescription\\":\\"查询知识库\\"}"}\n\n',
      'event: conversation.message.delta\ndata: {"role":"assistant","content_type":"text","type":"answer","content":"DBA需要掌握SQL"}\n\n',
      "event: done\ndata: [DONE]\n\n",
    ]));
    expect(events).toContainEqual({ type: "tool_start", name: "knowledge", toolType: "knowledge", toolId: "call_123", toolDescription: "查询知识库", toolParameters: undefined });
    expect(events).toContainEqual({ type: "tool_end", name: "knowledge", toolType: "knowledge", toolId: "call_123", resultSummary: "[参考资料 1] (相关度: 0.80)\nDBA技能要求", toolDescription: "查询知识库" });
    expect(events).toContainEqual({ type: "text_delta", text: "DBA需要掌握SQL" });
    expect(events[events.length - 1]).toEqual({ type: "done" });
  });

  it("skips known agentic internal events without warning（agentic_analyze_start 等）", async () => {
    const events = await collect(chunkedStream([
      'event: conversation.chat.created\ndata: {"conversation_id":"remote-3","status":"created"}\n\n',
      'event: conversation.message.delta\ndata: {"role":"assistant","content_type":"object_string","type":"agentic_analyze_start","content":"{\\"state\\":\\"ANALYZING\\"}"}\n\n',
      'event: conversation.message.delta\ndata: {"role":"assistant","content_type":"text","type":"answer","content":"好的"}\n\n',
      "event: done\ndata: [DONE]\n\n",
    ]));
    // agentic 内部事件不应产生 warning
    expect(events.filter((e) => e.type === "warning")).toHaveLength(0);
    expect(events).toContainEqual({ type: "text_delta", text: "好的" });
    expect(events[events.length - 1]).toEqual({ type: "done" });
  });

  it("completion event produces done without text_final（真实 API 不在 completed 中发送文本）", async () => {
    const events = await collect(chunkedStream([
      'event: conversation.message.delta\ndata: {"role":"assistant","content_type":"text","type":"answer","content":"完成"}\n\n',
      'event: conversation.chat.completed\ndata: {"conversation_id":"remote-2","status":"completed"}\n\n',
    ]));
    expect(events.filter((event) => event.type === "done")).toHaveLength(1);
    // 文本来自 delta，不是来自 completed 事件
    expect(events).toContainEqual({ type: "text_delta", text: "完成" });
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
