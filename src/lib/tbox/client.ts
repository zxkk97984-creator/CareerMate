import { TboxError, type TboxErrorCode } from "./errors";
import type { ChatInput, Clock, TboxDependencies } from "./types";

const systemClock: Clock = {
  setTimeout: (callback, timeoutMs) => setTimeout(callback, timeoutMs),
  clearTimeout: (timer) => clearTimeout(timer),
};

function dependencies(deps: TboxDependencies) {
  return {
    fetchImpl: deps.fetchImpl ?? fetch,
    clock: deps.clock ?? systemClock,
  };
}

async function timedResponse<T>(
  url: URL,
  init: RequestInit,
  deps: TboxDependencies,
  consume: (response: Response, onActivity: () => void) => Promise<T>,
  idleTimeout = false,
  notFoundCode?: TboxErrorCode,
): Promise<T> {
  const { fetchImpl, clock } = dependencies(deps);
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(deps.config.streamTimeoutMs)
    ? deps.config.streamTimeoutMs
    : 90_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const armTimeout = () => {
    if (timer !== undefined) clock.clearTimeout(timer);
    timer = clock.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  };
  const abortFromCaller = () => controller.abort(deps.signal?.reason);
  if (deps.signal?.aborted) abortFromCaller();
  else deps.signal?.addEventListener("abort", abortFromCaller, { once: true });
  armTimeout();
  let responseReceived = false;
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    responseReceived = true;
    if (!response.ok) {
      const code =
        response.status === 401 || response.status === 403
          ? "API_AUTH_FAILED"
          : response.status === 404
            ? notFoundCode ?? "PROVIDER_ERROR"
            : "PROVIDER_ERROR";
      throw new TboxError("http_error", code);
    }
    if (idleTimeout) armTimeout();
    return await consume(response, idleTimeout ? armTimeout : () => undefined);
  } catch (error) {
    if (deps.signal?.aborted) throw new TboxError("aborted", "ABORTED");
    if (timedOut || (controller.signal.aborted && error instanceof Error && error.name === "AbortError")) {
      throw new TboxError("timeout", "TIMEOUT");
    }
    if (error instanceof TboxError) throw error;
    if (!responseReceived) throw new TboxError("http_error", "PROVIDER_ERROR");
    throw new TboxError("provider_error", "PROVIDER_ERROR");
  } finally {
    if (timer !== undefined) clock.clearTimeout(timer);
    deps.signal?.removeEventListener("abort", abortFromCaller);
  }
}

function authorizationHeaders(apiKey: string) {
  return { Authorization: apiKey, "Content-Type": "application/json" };
}

function ensureChatConfig(deps: TboxDependencies) {
  if (!deps.config.apiKey || !deps.config.agentId || !deps.config.chatEndpoint) {
    throw new TboxError("missing_config", "API_CONFIG_MISSING");
  }
}

export async function consumeChatResponse<T>(
  input: ChatInput,
  stream: boolean,
  deps: TboxDependencies,
  consume: (response: Response, onActivity: () => void) => Promise<T>,
): Promise<T> {
  ensureChatConfig(deps);
  const url = new URL(deps.config.chatEndpoint);
  // conversation_id 放入请求体，不再放在 URL 查询参数中
  const body: Record<string, unknown> = {
    agent_id: deps.config.agentId,
    question: input.question,
    user_id: input.userId,
    search_engine: deps.config.searchEngine,
    stream,
  };
  if (input.conversationId) body.conversation_id = input.conversationId;
  if (deps.config.agentVersion) body.agent_version = deps.config.agentVersion;
  if (input.history !== undefined) body.history = input.history;
  if (input.context !== undefined) body.business_data = JSON.stringify(input.context);
  const headers: Record<string, string> = authorizationHeaders(deps.config.apiKey);
  if (stream) headers.Accept = "text/event-stream";
  return timedResponse(
    url,
    { method: "POST", headers, body: JSON.stringify(body) },
    deps,
    consume,
    stream,
    "AGENT_NOT_PUBLISHED",
  );
}

export async function readJsonResponse(response: Response) {
  try {
    return await response.json();
  } catch {
    throw new TboxError("invalid_response");
  }
}

export function requestChatJson(input: ChatInput, deps: TboxDependencies) {
  return consumeChatResponse(input, false, deps, readJsonResponse);
}

export async function requestRetrieval(
  body: Record<string, unknown>,
  deps: TboxDependencies,
) {
  if (!deps.config.apiKey || !deps.config.retrieveEndpoint) {
    throw new TboxError("missing_config", "API_CONFIG_MISSING");
  }
  return timedResponse(
    new URL(deps.config.retrieveEndpoint),
    {
      method: "POST",
      headers: authorizationHeaders(deps.config.apiKey),
      body: JSON.stringify(body),
    },
    deps,
    readJsonResponse,
  );
}

// ── 脱敏探针报告 ─────────────────────────────

/** 百宝箱契约探针的安全报告结构，不含 prompt、密钥或完整请求体 */
export interface SafeProbeResult {
  name: string;
  status: "pass" | "fail" | "blocked";
  httpOk: boolean;
  actualMode: "api" | "manual" | "mock";
  eventNames: string[];
  hasConversationId: boolean;
  hasText: boolean;
  hasStructuredResult: boolean;
  citationCount: number;
  note: string;
}

/** 对探针原始结果进行脱敏，剥离敏感字段并将非 api 模式标记为 blocked */
export function sanitizeProbeResult(
  raw: SafeProbeResult & { prompt?: string; authorization?: string; fullPayload?: unknown },
): SafeProbeResult {
  const { name, httpOk, actualMode, eventNames, hasConversationId, hasText, hasStructuredResult, citationCount } = raw;

  // 非 api 模式一律标记为 blocked
  const effectiveStatus: SafeProbeResult["status"] =
    actualMode !== "api" ? "blocked" : raw.status;

  // 对 blocked 补充说明
  let note = raw.note;
  if (actualMode !== "api" && !note.includes("manual") && !note.includes("mock")) {
    note = note ? `${note}（${actualMode} fallback）` : `${actualMode} fallback，非真实 API`;
  }

  return {
    name,
    status: effectiveStatus,
    httpOk,
    actualMode,
    eventNames,
    hasConversationId,
    hasText,
    hasStructuredResult,
    citationCount,
    note,
  };
}
