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

export async function streamChatWithTbox(
  input: ChatInput,
  deps: StreamDependencies,
): Promise<AiResult<{ events: NormalizedStreamEvent[] }>> {
  const requested = deps.config.mode;
  if (requested === "mock") {
    return {
      data: { events: localEvents(createMockChatChunks(input.question), input.conversationId) },
      meta: meta(requested, "mock", null, "local-mock"),
    };
  }
  if (requested === "manual") {
    const events = await manualEvents(input, deps);
    return events
      ? { data: { events }, meta: meta(requested, "manual", null, "manual-fixture") }
      : {
          data: { events: localEvents(createMockChatChunks(input.question), input.conversationId) },
          meta: meta(requested, "mock", "manual_unavailable", "local-mock"),
        };
  }

  let reason: TboxFailureReason;
  try {
    const events = await consumeChatResponse(input, true, deps, async (response) => {
      if (!response.body) throw new TboxError("sse_error");
      const normalized: NormalizedStreamEvent[] = [];
      for await (const event of parseUpstreamSse(response.body)) {
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
  }
  const events = await manualEvents(input, deps);
  return events
    ? { data: { events }, meta: meta(requested, "manual", reason, "manual-fixture") }
    : {
        data: { events: localEvents(createMockChatChunks(input.question), input.conversationId) },
        meta: meta(requested, "mock", reason, "local-mock"),
      };
}
