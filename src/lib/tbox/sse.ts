import type { NormalizedStreamEvent } from "./types";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function conversationIdFrom(value: Record<string, unknown>) {
  const candidate = value.conversation_id ?? value.conversationId ?? value.converstionId;
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}

function parseSseBlock(block: string) {
  let eventName = "message";
  const dataLines: string[] = [];
  for (const line of block.split(/\r\n|\r|\n/)) {
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") eventName = value;
    if (field === "data") dataLines.push(value);
  }
  return { eventName, rawData: dataLines.join("\n") };
}

export async function* parseUpstreamSse(
  stream: ReadableStream<Uint8Array>,
  options: { onActivity?: () => void } = {},
): AsyncGenerator<NormalizedStreamEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let conversationId: string | null = null;
  let terminal = false;
  let readerDone = false;

  function boundary() {
    const match = /\r\n\r\n|\n\n|\r\r/.exec(buffer);
    return match ? { index: match.index, length: match[0].length } : null;
  }

  async function* consume(block: string): AsyncGenerator<NormalizedStreamEvent> {
    if (!block.trim() || terminal) return;
    const { eventName, rawData } = parseSseBlock(block);
    if (eventName === "done" || rawData.trim() === "[DONE]") {
      terminal = true;
      yield { event: "done", data: { conversationId } };
      return;
    }
    if (!rawData) return;

    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(rawData);
      const parsedRecord = record(parsed);
      if (!parsedRecord) throw new Error("not an object");
      payload = parsedRecord;
    } catch {
      terminal = true;
      yield {
        event: "error",
        data: { type: "error", message: "百宝箱流式响应格式无效" },
      };
      return;
    }

    const upstreamEvent =
      typeof payload.event === "string" && payload.event ? payload.event : eventName;
    const data = record(payload.data) ?? payload;
    conversationId = conversationIdFrom(data) ?? conversationIdFrom(payload) ?? conversationId;

    if (upstreamEvent === "conversation.message.delta") {
      if (data.type === "answer" && data.content_type === "text" && typeof data.content === "string") {
        yield { event: "message", data: { type: "delta", content: data.content } };
      }
      return;
    }
    if (upstreamEvent === "conversation.chat.completed" || upstreamEvent === "done") {
      terminal = true;
      yield { event: "done", data: { conversationId } };
      return;
    }
    if (upstreamEvent === "error") {
      terminal = true;
      yield {
        event: "error",
        data: { type: "error", message: "百宝箱服务暂时不可用" },
      };
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value?.byteLength) options.onActivity?.();
      buffer += decoder.decode(value, { stream: !done });
      let delimiter = boundary();
      while (delimiter) {
        const block = buffer.slice(0, delimiter.index);
        buffer = buffer.slice(delimiter.index + delimiter.length);
        yield* consume(block);
        if (terminal) break;
        delimiter = boundary();
      }
      if (done) {
        readerDone = true;
        break;
      }
      if (terminal) break;
    }
    if (!terminal && buffer.trim()) yield* consume(buffer);
  } finally {
    if (!readerDone) {
      try {
        void reader.cancel().catch(() => undefined);
      } catch {
        // The fetch body may already be errored by an abort.
      }
    }
    reader.releaseLock();
  }
}
