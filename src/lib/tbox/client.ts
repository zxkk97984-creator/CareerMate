import { TboxError, type TboxErrorCode } from "./errors";
import type { ChatInput, Clock, TboxDependencies } from "./types";

const systemClock: Clock = {
  setTimeout: (callback, timeoutMs) => setTimeout(callback, timeoutMs),
  clearTimeout: (timer) => clearTimeout(timer),
};

/** 百宝箱 API 允许的主机名后缀 */
const ALLOWED_ENDPOINT_SUFFIXES = [".tbox.cn", "tbox.cn"];

function dependencies(deps: TboxDependencies) {
  return {
    fetchImpl: deps.fetchImpl ?? fetch,
    clock: deps.clock ?? systemClock,
  };
}

function validateEndpoint(url: URL, allowTestOverride?: boolean): void {
  // 测试注入路径：显式 test-only 注入允许任意 endpoint
  if (allowTestOverride) return;
  if (url.protocol !== "https:") {
    throw new TboxError("missing_config", "API_CONFIG_MISSING");
  }
  const hostname = url.hostname.toLowerCase();
  const allowed = ALLOWED_ENDPOINT_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
  if (!allowed) {
    throw new TboxError("missing_config", "API_CONFIG_MISSING");
  }
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
      // 尝试从响应体提取平台错误码
      let platformCode: string | undefined;
      try {
        const errorBody = await response.clone().json();
        platformCode =
          typeof errorBody?.code === "string"
            ? errorBody.code
            : typeof errorBody?.error === "string"
              ? errorBody.error
              : undefined;
      } catch { /* 忽略解析失败 */ }

      const code =
        response.status === 401 || response.status === 403
          ? "API_AUTH_FAILED"
          : response.status === 404
            ? notFoundCode ?? "PROVIDER_ERROR"
            : "PROVIDER_ERROR";
      throw new TboxError("http_error", code, {
        httpStatus: response.status,
        platformCode,
      });
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

/**
 * 搜索是否启用：全局开关 AND per-turn searchPolicy === "required"
 * per-turn 不能绕过全局关闭
 */
function resolveSearchEnabled(deps: TboxDependencies, input: ChatInput): boolean {
  const globalOn = deps.config.searchEngine === true;
  const perTurnRequired = (input as ChatInput & { searchPolicy?: string }).searchPolicy === "required";
  return globalOn && perTurnRequired;
}

export async function consumeChatResponse<T>(
  input: ChatInput,
  stream: boolean,
  deps: TboxDependencies,
  consume: (response: Response, onActivity: () => void) => Promise<T>,
): Promise<T> {
  ensureChatConfig(deps);
  const url = new URL(deps.config.chatEndpoint);

  // 端点安全校验（测试可注入绕过）
  const isTestOverride = deps.fetchImpl !== undefined && deps.fetchImpl !== fetch;
  validateEndpoint(url, isTestOverride);

  const searchEnabled = resolveSearchEnabled(deps, input);

  const body: Record<string, unknown> = {
    agent_id: deps.config.agentId,
    question: input.question,
    user_id: input.userId,
    search_engine: searchEnabled,
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
  const url = new URL(deps.config.retrieveEndpoint);
  validateEndpoint(url, deps.fetchImpl !== undefined && deps.fetchImpl !== fetch);
  return timedResponse(
    url,
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

  const effectiveStatus: SafeProbeResult["status"] =
    actualMode !== "api" ? "blocked" : raw.status;

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
