import type { NormalizedAiEvent } from "./types";

// ── 小型提取函数 ──────────────────────────────────────

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
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
  // answer + text → 正文增量
  if (msg.type === "answer" && msg.content_type === "text" && typeof msg.content === "string") {
    return msg.content;
  }
  // follow_up + text → 追问建议文本
  if (msg.type === "follow_up" && msg.content_type === "text" && typeof msg.content === "string") {
    return msg.content;
  }
  return null;
}

// ── Agentic delta 类型白名单（已知的非终止事件，不产生 UNKNOWN_EVENT warning）──

const AGENTIC_INTERNAL_TYPES = new Set([
  "agentic_analyze_start",
  "agentic_analyze_end",
  "agentic_round_summary",
  "agentic_act_start",
  "agentic_act_end",
  "agentic_complete",
  "agentic_memory_compacted",
  "agentic_forced_complete_start",
  "agentic_forced_complete_end",
]);

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

  /** 解析 delta 消息的 content JSON（object_string 类型） */
  function parseDeltaContent(raw: string | undefined): Record<string, unknown> | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return record(parsed);
    } catch {
      return null;
    }
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
      const trimmed = rawData.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        yield { type: "error", code: "SSE_PARSE_FAILED", message: "百宝箱流式响应格式无效" };
        return;
      }
      yield { type: "text_final", text: trimmed };
      return;
    }

    const data = record(payload.data) ?? payload;

    // 提取 conversation ID
    const cid = conversationIdFrom(data, payload);
    if (cid && cid !== conversationId) {
      conversationId = cid;
      yield { type: "conversation", conversationId: cid };
    }

    // ── chat 生命周期事件 ──────────────────────────
    if (eventName === "conversation.chat.created" || eventName === "conversation.chat.in_progress") {
      if (conversationId) yield { type: "conversation", conversationId };
      return;
    }

    // ── conversation.chat.failed ────────────────────
    if (eventName === "conversation.chat.failed") {
      terminal = true;
      yield { type: "error", code: "PROVIDER_ERROR", message: "百宝箱 Agent 执行失败，请稍后重试。" };
      return;
    }

    // ── error 事件 ──────────────────────────────────
    if (eventName === "error") {
      terminal = true;
      yield { type: "error", code: "PROVIDER_ERROR", message: "百宝箱服务暂时不可用" };
      return;
    }

    // ── conversation.chat.completed ─────────────────
    if (eventName === "conversation.chat.completed") {
      terminal = true;
      // 真实 API 的 completed 事件不包含 structured_result/variables.result
      // 只有 status/usage/timestamps 等元数据
      yield { type: "done" };
      return;
    }

    // ── conversation.message.delta（核心事件）────────
    if (eventName === "conversation.message.delta") {
      const msgType = str(data.type);

      // agentic_error 内联错误
      if (msgType === "agentic_error") {
        yield { type: "warning", code: "AGENT_ERROR" };
        return;
      }

      // agentic_tool_start → 工具调用开始
      if (msgType === "agentic_tool_start") {
        const toolContent = parseDeltaContent(str(data.content));
        yield {
          type: "tool_start",
          name: str(data.toolType ?? toolContent?.toolType),
          toolType: str(data.toolType ?? toolContent?.toolType),
          toolId: str(data.toolId ?? toolContent?.toolId),
          toolDescription: str(data.toolDescription ?? toolContent?.toolDescription),
          toolParameters: data.toolParameters ?? toolContent?.toolParameters,
        };
        return;
      }

      // agentic_tool_end → 工具调用结束（含 resultSummary）
      if (msgType === "agentic_tool_end") {
        const toolContent = parseDeltaContent(str(data.content));
        yield {
          type: "tool_end",
          name: str(data.toolType ?? toolContent?.toolType),
          toolType: str(data.toolType ?? toolContent?.toolType),
          toolId: str(data.toolId ?? toolContent?.toolId),
          resultSummary: str(data.resultSummary ?? toolContent?.resultSummary),
          toolDescription: str(data.toolDescription ?? toolContent?.toolDescription),
        };
        return;
      }

      // agentic 内部事件（analyze/act/round_summary/complete/memory）→ 透传，不 warning
      if (AGENTIC_INTERNAL_TYPES.has(msgType)) {
        const innerContent = parseDeltaContent(str(data.content));
        yield { type: "agentic_event", subtype: msgType, payload: innerContent ?? data };
        return;
      }

      // answer / follow_up 文本
      const text = textFromMessage(data);
      if (text) {
        yield { type: "text_delta", text };
        return;
      }

      // 未知 delta 类型 → warning
      yield { type: "warning", code: "UNKNOWN_EVENT" };
      return;
    }

    // ── 兼容旧格式：conversation.message.completed ───
    if (eventName === "conversation.message.completed") {
      const text = textFromMessage(data);
      if (text) yield { type: "text_final", text };
      return;
    }

    // ── 未知事件 → warning，仍然尝试提取文本 ────────
    yield { type: "warning", code: "UNKNOWN_EVENT" };
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
