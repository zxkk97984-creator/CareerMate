import { failureReason, TboxError, type TboxFailureReason } from "./errors";
import { createManualChatAnswer, createMockChatChunks } from "./fixtures";
import { consumeChatResponse } from "./client";
import { parseUpstreamSse } from "./sse";
import type {
  AiResult,
  ChatInput,
  Clock,
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

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new TboxError("aborted");
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
      for await (const event of parseUpstreamSse(response.body, { onActivity })) {
        if (event.event === "error") throw new TboxError("sse_error");
        normalized.push(event);
      }
      if (!normalized.some((event) => event.event === "done")) {
        throw new TboxError("sse_error");
      }
      return normalized;
    });
    return { data: { events }, meta: meta(requested, "api", null, "tbox-api") };
  } catch (error) {
    reason = failureReason(error);
    if (reason === "aborted" || deps.signal?.aborted) throw new TboxError("aborted");
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
 * 渐进式流式对话——每个事件到达后立即调用 onEvent 回调，
 * 不缓冲整个事件数组。用于需要实时 SSE 推送到浏览器的场景。
 *
 * 返回 Promise，resolve 时表示流结束。meta 信息在 onEvent 中通过 event.meta 携带。
 */
export async function streamChatWithTboxProgressive(
  input: ChatInput,
  deps: StreamDependencies,
  onEvent: StreamEventCallback,
): Promise<ReturnType<typeof meta>> {
  throwIfAborted(deps.signal);
  const requested = deps.config.mode;

  // mock 模式
  if (requested === "mock") {
    const events = localEvents(createMockChatChunks(input.question), input.conversationId);
    const metaObj = meta(requested, "mock", null, "local-mock");
    for (const event of events) {
      onEvent({ ...event, meta: metaObj });
    }
    return metaObj;
  }

  // manual 模式
  if (requested === "manual") {
    const events = await manualEvents(input, deps);
    throwIfAborted(deps.signal);
    const source = events ? "manual-fixture" : "local-mock";
    const actualMode: TboxConfig["mode"] = events ? "manual" : "mock";
    const reason = events ? null : "manual_unavailable";
    const effective = events ?? localEvents(createMockChatChunks(input.question), input.conversationId);
    const metaObj = meta(requested, actualMode, reason, source);
    for (const event of effective) {
      onEvent({ ...event, meta: metaObj });
    }
    return metaObj;
  }

  // api 模式：渐进式消费上游 SSE，边收边回调
  let reason: TboxFailureReason;
  try {
    const resultMeta = await consumeChatResponse(input, true, deps, async (response, onActivity) => {
      if (!response.body) throw new TboxError("sse_error");
      let hasDone = false;
      const apiMetaObj = meta(requested, "api", null, "tbox-api");
      for await (const event of parseUpstreamSse(response.body, { onActivity })) {
        if (event.event === "error") throw new TboxError("sse_error");
        if (event.event === "done") hasDone = true;
        // 立即回调，不收集到数组
        onEvent({ ...event, meta: apiMetaObj });
      }
      if (!hasDone) throw new TboxError("sse_error");
      return apiMetaObj;
    });
    return resultMeta;
  } catch (error) {
    reason = failureReason(error);
    if (reason === "aborted" || deps.signal?.aborted) throw new TboxError("aborted");
  }

  // api 失败后降级到 manual/mock
  throwIfAborted(deps.signal);
  const fallbackEvents = await manualEvents(input, deps);
  throwIfAborted(deps.signal);
  const effective = fallbackEvents ?? localEvents(createMockChatChunks(input.question), input.conversationId);
  const actualMode: TboxConfig["mode"] = fallbackEvents ? "manual" : "mock";
  const source = fallbackEvents ? "manual-fixture" : "local-mock";
  const metaObj = meta(requested, actualMode, reason, source);
  for (const event of effective) {
    onEvent({ ...event, meta: metaObj });
  }
  return metaObj;
}
