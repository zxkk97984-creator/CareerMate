import type { NormalizedAiEvent } from "./types";

// ── 小型提取函数 ──────────────────────────────────────

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function conversationIdFrom(...values: unknown[]): string | null {
  for (const value of values) {
    const rec = record(value);
    if (!rec) continue;
    const candidate = rec.conversation_id ?? rec.conversationId ?? rec.converstionId;
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return null;
}

function textFromMessage(value: unknown): string | null {
  const msg = record(value);
  if (!msg) return null;
  if (msg.type === "answer" && msg.content_type === "text" && typeof msg.content === "string") {
    return msg.content;
  }
  return null;
}

function structuredFromCompletion(value: unknown): unknown | undefined {
  const obj = record(value);
  if (!obj) return undefined;
  // variables.result 优先
  const variables = record(obj.variables);
  if (variables && variables.result !== undefined) return variables.result;
  // 直接 result 字段
  if (obj.result !== undefined) return obj.result;
  return undefined;
}

function eventNameFrom(sseEvent: string, payload: Record<string, unknown>): string {
  return typeof payload.event === "string" && payload.event ? payload.event : sseEvent;
}

/** 从 completion 事件的 messages 数组中提取所有 answer 文本 */
function textFromMessages(payload: Record<string, unknown>): string | null {
  const messages = payload.messages;
  if (!Array.isArray(messages)) return null;
  const texts: string[] = [];
  for (const msg of messages) {
    const t = textFromMessage(msg);
    if (t) texts.push(t);
  }
  return texts.length > 0 ? texts.join("") : null;
}

// ── SSE 块解析 ─────────────────────────────────────────

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

// ── 上游 SSE 归一化生成器 ──────────────────────────────

export async function* parseUpstreamSse(
  stream: ReadableStream<Uint8Array>,
  options: { onActivity?: () => void } = {},
): AsyncGenerator<NormalizedAiEvent> {
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

  async function* consume(block: string): AsyncGenerator<NormalizedAiEvent> {
    if (!block.trim() || terminal) return;
    const { eventName, rawData } = parseSseBlock(block);

    // 终端信号：[DONE] 或 done 事件
    if (eventName === "done" || rawData.trim() === "[DONE]") {
      terminal = true;
      yield { type: "done" };
      return;
    }
    if (!rawData) return;

    // 尝试 JSON 解析
    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(rawData);
      const parsedRecord = record(parsed);
      if (!parsedRecord) throw new Error("not an object");
      payload = parsedRecord;
    } catch {
      // 非 JSON data
      const trimmed = rawData.trim();
      // 若以 { 或 [ 开头，说明是损坏的 JSON，安全处理为 error
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        yield {
          type: "error",
          code: "SSE_PARSE_FAILED",
          message: "百宝箱流式响应格式无效",
        };
        return;
      }
      // 纯文本 → text_final
      yield { type: "text_final", text: trimmed };
      return;
    }

    const upstreamEvent = eventNameFrom(eventName, payload);
    const data = record(payload.data) ?? payload;

    // 提取 conversation ID，首次发现时产出 conversation 事件
    const cid = conversationIdFrom(data, payload);
    if (cid && cid !== conversationId) {
      conversationId = cid;
      yield { type: "conversation", conversationId: cid };
    }

    // ── 按事件类型分发 ──────────────────────────────

    // conversation.chat.created / conversation.chat.in_progress → warning（记录但继续）
    if (upstreamEvent === "conversation.chat.created" || upstreamEvent === "conversation.chat.in_progress") {
      if (conversationId) yield { type: "conversation", conversationId };
      return;
    }

    // 工具开始
    if (upstreamEvent === "workflow.node.started" || upstreamEvent === "tool.start") {
      const name = stringValue(data.name, data.tool_name) ?? undefined;
      yield { type: "tool_start", name };
      return;
    }

    // 工具结束
    if (upstreamEvent === "workflow.node.completed" || upstreamEvent === "tool.end") {
      const name = stringValue(data.name, data.tool_name) ?? undefined;
      yield { type: "tool_end", name, payload: data };
      return;
    }

    // delta 文本（逐段推送）
    if (upstreamEvent === "conversation.message.delta") {
      // 检测 agentic_error 内联错误——平台工作流报错时在 delta 数据中嵌入
      if (data.type === "agentic_error") {
        yield { type: "warning", code: "AGENT_ERROR" };
        const errMsg = stringValue(data.content) ?? "Agent 执行出错";
        yield { type: "text_delta", text: errMsg };
        return;
      }
      const text = textFromMessage(data);
      if (text) yield { type: "text_delta", text };
      return;
    }

    // 平台终端失败事件
    if (upstreamEvent === "conversation.chat.failed") {
      terminal = true;
      yield {
        type: "error",
        code: "PROVIDER_ERROR",
        message: "百宝箱 Agent 执行失败，请稍后重试。",
      };
      return;
    }

    // 引用
    if (upstreamEvent === "conversation.message.citation") {
      yield { type: "citation", payload: data };
      return;
    }

    // 终端：聊天完成
    if (upstreamEvent === "conversation.chat.completed") {
      terminal = true;

      // 从 messages 数组提取文本
      const messagesText = textFromMessages(data);
      if (messagesText) yield { type: "text_final", text: messagesText };

      // 从 variables 提取结构化结果
      const structured = structuredFromCompletion(data);
      if (structured !== undefined) {
        yield { type: "structured_result", payload: structured };
      }

      yield { type: "done" };
      return;
    }

    // conversation.message.completed（兼容旧格式）
    if (upstreamEvent === "conversation.message.completed") {
      const text = textFromMessage(data);
      if (text) yield { type: "text_final", text };
      const structured = structuredFromCompletion(data);
      if (structured !== undefined) {
        yield { type: "structured_result", payload: structured };
      }
      return;
    }

    // 错误事件
    if (upstreamEvent === "error") {
      terminal = true;
      yield {
        type: "error",
        code: "PROVIDER_ERROR",
        message: "百宝箱服务暂时不可用",
      };
      return;
    }

    // 未知非终止事件 → warning，继续消费
    yield { type: "warning", code: "UNKNOWN_EVENT" };
    // 如果 data 中有 answer 文本，仍然提取
    const text = textFromMessage(data);
    if (text) yield { type: "text_final", text };
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
        // fetch body 可能已被 abort 终止
      }
    }
    reader.releaseLock();
  }
}
