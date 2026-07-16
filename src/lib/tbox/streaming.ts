import { failureReason, TboxError, type TboxFailureReason } from "./errors";
import { createManualChatAnswer, createMockChatChunks, createMockStructuredResult } from "./fixtures";
import { consumeChatResponse } from "./client";
import { parseUpstreamSse } from "./sse";
import { createAssistantResultAccumulator } from "./result";
import type {
  AiResult,
  ChatInput,
  Clock,
  NormalizedAssistantResult,
  NormalizedStreamEvent,
  TboxConfig,
} from "./types";

interface StreamDependencies {
  config: TboxConfig;
  fetchImpl?: typeof fetch;
  clock?: Clock;
  manualChat?: (input: ChatInput) => Promise<string | null>;
  signal?: AbortSignal;
}

function meta(
  requestedMode: TboxConfig["mode"],
  actualMode: TboxConfig["mode"],
  fallbackReason: TboxFailureReason | null,
  source: string,
) {
  return {
    requestedMode,
    actualMode,
    degraded: requestedMode !== actualMode || fallbackReason !== null,
    fallbackReason,
    source,
  };
}

function localEvents(chunks: string[], conversationId?: string): NormalizedStreamEvent[] {
  return [
    ...chunks.map(
      (content): NormalizedStreamEvent => ({ event: "message", data: { type: "delta", content } }),
    ),
    { event: "done", data: { conversationId: conversationId ?? null } },
  ];
}

function localResult(chunks: string[], conversationId?: string, structured?: unknown): NormalizedAssistantResult {
  return {
    text: chunks.join(""),
    conversationId,
    citations: [],
    warnings: [],
    toolCalls: [],
    structured,
  };
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new TboxError("aborted", "ABORTED");
}

function upstreamStreamError(code: string) {
  return code === "SSE_PARSE_FAILED"
    ? new TboxError("sse_error", "SSE_PARSE_FAILED")
    : new TboxError("provider_error", "PROVIDER_ERROR");
}

async function manualEvents(input: ChatInput, deps: StreamDependencies) {
  try {
    const answer = deps.manualChat
      ? await deps.manualChat(input)
      : createManualChatAnswer(input.question);
    return answer?.trim() ? localEvents([answer.trim()], input.conversationId) : null;
  } catch {
    return null;
  }
}

async function manualResult(input: ChatInput, deps: StreamDependencies) {
  try {
    const answer = deps.manualChat
      ? await deps.manualChat(input)
      : createManualChatAnswer(input.question);
    return answer?.trim()
      ? { text: answer.trim(), conversationId: input.conversationId, citations: [], warnings: [], toolCalls: [] }
      : null;
  } catch {
    return null;
  }
}

/** 流式对话（收集全部事件后返回）——兼容旧调用 */
export async function streamChatWithTbox(
  input: ChatInput,
  deps: StreamDependencies,
): Promise<AiResult<{ events: NormalizedStreamEvent[] }>> {
  throwIfAborted(deps.signal);
  const requested = deps.config.mode;
  if (requested === "mock") {
    return {
      data: { events: localEvents(createMockChatChunks(input.question), input.conversationId) },
      meta: meta(requested, "mock", null, "local-mock"),
    };
  }
  if (requested === "manual") {
    const events = await manualEvents(input, deps);
    throwIfAborted(deps.signal);
    return events
      ? { data: { events }, meta: meta(requested, "manual", null, "manual-fixture") }
      : {
          data: { events: localEvents(createMockChatChunks(input.question), input.conversationId) },
          meta: meta(requested, "mock", "manual_unavailable", "local-mock"),
        };
  }

  let reason: TboxFailureReason;
  try {
    const events = await consumeChatResponse(input, true, deps, async (response, onActivity) => {
      if (!response.body) throw new TboxError("sse_error");
      const normalized: NormalizedStreamEvent[] = [];
      const acc = createAssistantResultAccumulator();
      let completed = false;
      for await (const event of parseUpstreamSse(response.body, { onActivity })) {
        if (event.type === "error") throw upstreamStreamError(event.code);
        if (event.type === "done") completed = true;
        const delta = acc.consume(event);
        if (delta) normalized.push({ event: "message", data: { type: "delta", content: delta } });
      }
      if (!completed) {
        throw new TboxError("sse_error");
      }
      const final = acc.finalize();
      if (!final.text && (!final.toolCalls || final.toolCalls.length === 0)) {
        throw new TboxError("invalid_response", "EMPTY_RESPONSE");
      }
      normalized.push({ event: "done", data: { conversationId: final.conversationId ?? null } });
      return normalized;
    });
    return { data: { events }, meta: meta(requested, "api", null, "tbox-api") };
  } catch (error) {
    reason = failureReason(error);
    if (reason === "aborted" || deps.signal?.aborted) {
      throw new TboxError("aborted", "ABORTED");
    }
  }
  throwIfAborted(deps.signal);
  const events = await manualEvents(input, deps);
  throwIfAborted(deps.signal);
  return events
    ? { data: { events }, meta: meta(requested, "manual", reason, "manual-fixture") }
    : {
        data: { events: localEvents(createMockChatChunks(input.question), input.conversationId) },
        meta: meta(requested, "mock", reason, "local-mock"),
      };
}

// ── 渐进式流式（回调模式）─────────────────────────────────

export type StreamEventCallback = (event: NormalizedStreamEvent & {
  meta?: ReturnType<typeof meta>;
}) => void;

/**
 * 渐进式流式对话——每个事件到达后立即通过 accumulator 处理，
 * 只将非空增量通过 onEvent 回调发送到浏览器。
 *
 * 返回 Promise<AiResult<NormalizedAssistantResult>>，包含最终文本和结构化结果。
 */
export async function streamChatWithTboxProgressive(
  input: ChatInput,
  deps: StreamDependencies,
  onEvent: StreamEventCallback,
): Promise<AiResult<NormalizedAssistantResult>> {
  throwIfAborted(deps.signal);
  const requested = deps.config.mode;

  // mock 模式
  if (requested === "mock") {
    const chunks = createMockChatChunks(input.question);
    const structured = createMockStructuredResult(input.question);
    const metaObj = meta(requested, "mock", null, "local-mock");
    for (const chunk of chunks) {
      onEvent({ event: "message", data: { type: "delta", content: chunk }, meta: metaObj });
    }
    onEvent({ event: "done", data: { conversationId: input.conversationId ?? null }, meta: metaObj });
    return { data: localResult(chunks, input.conversationId, structured), meta: metaObj };
  }

  // manual 模式
  if (requested === "manual") {
    const mResult = await manualResult(input, deps);
    throwIfAborted(deps.signal);
    if (mResult) {
      const structured = createMockStructuredResult(input.question);
      const metaObj = meta(requested, "manual", null, "manual-fixture");
      onEvent({ event: "message", data: { type: "delta", content: mResult.text }, meta: metaObj });
      onEvent({ event: "done", data: { conversationId: mResult.conversationId ?? null }, meta: metaObj });
      return { data: { ...mResult, structured }, meta: metaObj };
    }
    const chunks = createMockChatChunks(input.question);
    const fallbackStructured = createMockStructuredResult(input.question);
    const metaObj = meta(requested, "mock", "manual_unavailable", "local-mock");
    for (const chunk of chunks) {
      onEvent({ event: "message", data: { type: "delta", content: chunk }, meta: metaObj });
    }
    onEvent({ event: "done", data: { conversationId: input.conversationId ?? null }, meta: metaObj });
    return { data: localResult(chunks, input.conversationId, fallbackStructured), meta: metaObj };
  }

  // api 模式：渐进式消费上游 SSE，经过 accumulator
  let reason: TboxFailureReason;
  let apiTextEmitted = false;
  try {
    const result = await consumeChatResponse(input, true, deps, async (response, onActivity) => {
      if (!response.body) throw new TboxError("sse_error");
      const acc = createAssistantResultAccumulator();
      const apiMetaObj = meta(requested, "api", null, "tbox-api");
      let completed = false;
      for await (const event of parseUpstreamSse(response.body, { onActivity })) {
        if (event.type === "error") {
          throw upstreamStreamError(event.code);
        }
        if (event.type === "done") completed = true;

        // 消费事件，获取需转发的增量文本
        const delta = acc.consume(event);
        if (delta) {
          apiTextEmitted = true;
          onEvent({ event: "message", data: { type: "delta", content: delta }, meta: apiMetaObj });
        }
      }

      if (!completed) throw new TboxError("sse_error", "SSE_PARSE_FAILED");

      const final = acc.finalize();
      if (!final.text && (!final.toolCalls || final.toolCalls.length === 0)) throw new TboxError("sse_error");

      onEvent({
        event: "done",
        data: { conversationId: final.conversationId ?? null },
        meta: apiMetaObj,
      });

      return final;
    });
    return { data: result, meta: meta(requested, "api", null, "tbox-api") };
  } catch (error) {
    reason = failureReason(error);
    if (reason === "aborted" || deps.signal?.aborted) {
      throw new TboxError("aborted", "ABORTED");
    }
    if (apiTextEmitted) {
      throw error instanceof TboxError ? error : new TboxError(reason);
    }
  }

  // api 失败后降级到 manual/mock
  throwIfAborted(deps.signal);
  const mResult = await manualResult(input, deps);
  throwIfAborted(deps.signal);
  const actualMode: TboxConfig["mode"] = mResult ? "manual" : "mock";
  const source = mResult ? "manual-fixture" : "local-mock";
  const metaObj = meta(requested, actualMode, reason, source);

  if (mResult) {
    const fallbackStructured = createMockStructuredResult(input.question);
    onEvent({ event: "message", data: { type: "delta", content: mResult.text }, meta: metaObj });
    onEvent({ event: "done", data: { conversationId: mResult.conversationId ?? null }, meta: metaObj });
    return { data: { ...mResult, structured: fallbackStructured, warnings: [...mResult.warnings, reason] }, meta: metaObj };
  }
  const chunks = createMockChatChunks(input.question);
  const fallbackStructured = createMockStructuredResult(input.question);
  for (const chunk of chunks) {
    onEvent({ event: "message", data: { type: "delta", content: chunk }, meta: metaObj });
  }
  onEvent({ event: "done", data: { conversationId: input.conversationId ?? null }, meta: metaObj });
  return { data: { ...localResult(chunks, input.conversationId, fallbackStructured), warnings: [reason] }, meta: metaObj };
}
