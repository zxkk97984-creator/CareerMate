import type { z } from "zod";
import { failureReason, TboxError, type TboxFailureReason } from "./errors";
import { createManualChatAnswer, createMockChatChunks } from "./fixtures";
import { normalizeNonStreamChatResponse } from "./normalization";
import { consumeChatResponse, requestChatJson } from "./client";
import { parseUpstreamSse } from "./sse";
import type {
  AiResult,
  ChatInput,
  Clock,
  NormalizedAssistantResult,
  TboxConfig,
} from "./types";

interface AdapterDependencies {
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

function mockChat(input: ChatInput): NormalizedAssistantResult {
  return { text: createMockChatChunks(input.question).join("\n"), conversationId: input.conversationId, citations: [], warnings: [] };
}

/**
 * 流式收集完整文本。
 *
 * 长任务（如 36 个月职业规划）在非流式接口下会撞上平台 90 秒网关超时；
 * 流式接口首包秒回、持续输出，使用空闲超时（有数据活动就重置），可安全完成。
 */
async function requestChatJsonStreaming(
  input: ChatInput,
  deps: AdapterDependencies,
): Promise<NormalizedAssistantResult> {
  return consumeChatResponse(input, true, deps, async (response, onActivity) => {
    if (!response.body) throw new TboxError("sse_error", "SSE_PARSE_FAILED");
    let text = "";
    for await (const event of parseUpstreamSse(response.body, { onActivity })) {
      if (event.type === "text_delta" || event.type === "text_final") {
        text += event.text;
      } else if (event.type === "error") {
        throw new TboxError("provider_error", "PROVIDER_ERROR");
      }
    }
    return {
      text,
      conversationId: input.conversationId,
      citations: [],
      warnings: [],
    };
  });
}

async function manualChat(input: ChatInput, deps: AdapterDependencies) {
  try {
    const answer = deps.manualChat
      ? await deps.manualChat(input)
      : createManualChatAnswer(input.question);
    return answer?.trim()
      ? { text: answer.trim(), conversationId: input.conversationId, citations: [], warnings: [] }
      : null;
  } catch {
    return null;
  }
}

export async function chatWithTbox(
  input: ChatInput,
  deps: AdapterDependencies,
): Promise<AiResult<NormalizedAssistantResult>> {
  const requested = deps.config.mode;
  if (requested === "mock") {
    return { data: mockChat(input), meta: meta(requested, "mock", null, "local-mock") };
  }
  if (requested === "manual") {
    const fixture = await manualChat(input, deps);
    return fixture
      ? { data: fixture, meta: meta(requested, "manual", null, "manual-fixture") }
      : { data: mockChat(input), meta: meta(requested, "mock", "manual_unavailable", "local-mock") };
  }

  try {
    const data = normalizeNonStreamChatResponse(await requestChatJson(input, deps));
    return { data, meta: meta(requested, "api", null, "tbox-api") };
  } catch (error) {
    const reason = failureReason(error);
    const fixture = await manualChat(input, deps);
    return fixture
      ? { data: fixture, meta: meta(requested, "manual", reason, "manual-fixture") }
      : { data: mockChat(input), meta: meta(requested, "mock", reason, "local-mock") };
  }
}

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? text.trim();
  const spans = [
    [candidate.indexOf("{"), candidate.lastIndexOf("}")],
    [candidate.indexOf("["), candidate.lastIndexOf("]")],
  ]
    .filter(([start, end]) => start >= 0 && end > start)
    .sort(([left], [right]) => left - right);
  for (const json of [candidate, ...spans.map(([start, end]) => candidate.slice(start, end + 1))]) {
    try {
      return JSON.parse(json);
    } catch {
      // Try the next complete object or array span without exposing upstream text.
    }
  }
  throw new TboxError("validation_error");
}

interface StructuredGenerationOptions<T> {
  config: TboxConfig;
  userId: string;
  prompt: string;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  manual: () => Promise<unknown>;
  mock: () => unknown;
  fetchImpl?: typeof fetch;
  clock?: Clock;
  manualSource?: string | (() => string);
}

function validate<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown,
  reason: TboxFailureReason,
) {
  const result = schema.safeParse(value);
  if (!result.success) throw new TboxError(reason);
  return result.data;
}

async function manualStructured<T>(options: StructuredGenerationOptions<T>) {
  const value = await options.manual();
  if (value === null || value === undefined) return null;
  return validate(options.schema, value, "manual_invalid");
}

function mockStructured<T>(options: StructuredGenerationOptions<T>) {
  return validate(options.schema, options.mock(), "validation_error");
}

function structuredManualSource<T>(options: StructuredGenerationOptions<T>) {
  return typeof options.manualSource === "function"
    ? options.manualSource()
    : options.manualSource ?? "manual-fixture";
}

export async function generateStructuredWithTbox<T>(
  options: StructuredGenerationOptions<T>,
): Promise<AiResult<T>> {
  const requested = options.config.mode;
  if (requested === "mock") {
    return { data: mockStructured(options), meta: meta(requested, "mock", null, "local-mock") };
  }
  if (requested === "manual") {
    try {
      const fixture = await manualStructured(options);
      if (fixture !== null) {
        return {
          data: fixture,
          meta: meta(requested, "manual", null, structuredManualSource(options)),
        };
      }
      return {
        data: mockStructured(options),
        meta: meta(requested, "mock", "manual_unavailable", "local-mock"),
      };
    } catch {
      return {
        data: mockStructured(options),
        meta: meta(requested, "mock", "manual_invalid", "local-mock"),
      };
    }
  }

  let reason: TboxFailureReason;
  try {
    const streamed = await requestChatJsonStreaming(
      { question: options.prompt, userId: options.userId },
      options,
    );
    const data = validate(options.schema, extractJson(streamed.text), "validation_error");
    return { data, meta: meta(requested, "api", null, "tbox-api") };
  } catch (error) {
    reason = failureReason(error);
  }

  try {
    const fixture = await manualStructured(options);
    if (fixture !== null) {
      return {
        data: fixture,
        meta: meta(requested, "manual", reason, structuredManualSource(options)),
      };
    }
  } catch {
    // A safe local mock is the final deterministic fallback.
  }
  return { data: mockStructured(options), meta: meta(requested, "mock", reason, "local-mock") };
}

/**
 * 纯 API 模式的结构化生成：流式收集文本 → 提取 JSON → schema 校验。
 * 失败直接抛出（不降级到 manual/mock），由调用方决定如何处理。
 */
export async function generateStructuredApi<T>(
  options: Pick<
    StructuredGenerationOptions<T>,
    "config" | "userId" | "prompt" | "schema" | "fetchImpl" | "clock"
  >,
): Promise<T> {
  const streamed = await requestChatJsonStreaming(
    { question: options.prompt, userId: options.userId },
    options,
  );
  return validate(options.schema, extractJson(streamed.text), "validation_error");
}
