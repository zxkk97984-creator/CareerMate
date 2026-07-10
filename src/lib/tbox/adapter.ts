import type { z } from "zod";
import { failureReason, TboxError, type TboxFailureReason } from "./errors";
import { createManualChatAnswer, createMockChatChunks } from "./fixtures";
import { normalizeNonStreamChatResponse } from "./normalization";
import { requestChatJson } from "./client";
import type {
  AiResult,
  ChatInput,
  Clock,
  NormalizedChat,
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

function mockChat(input: ChatInput): NormalizedChat {
  return { conversationId: input.conversationId ?? null, answer: createMockChatChunks(input.question).join("\n") };
}

async function manualChat(input: ChatInput, deps: AdapterDependencies) {
  try {
    const answer = deps.manualChat
      ? await deps.manualChat(input)
      : createManualChatAnswer(input.question);
    return answer?.trim()
      ? { conversationId: input.conversationId ?? null, answer: answer.trim() }
      : null;
  } catch {
    return null;
  }
}

export async function chatWithTbox(
  input: ChatInput,
  deps: AdapterDependencies,
): Promise<AiResult<NormalizedChat>> {
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
    const chat = normalizeNonStreamChatResponse(
      await requestChatJson(
        { question: options.prompt, userId: options.userId },
        options,
      ),
    );
    const data = validate(options.schema, extractJson(chat.answer), "validation_error");
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
