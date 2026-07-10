import { TboxError } from "./errors";
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
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  const { fetchImpl, clock } = dependencies(deps);
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(deps.config.streamTimeoutMs)
    ? deps.config.streamTimeoutMs
    : 90_000;
  const timer = clock.setTimeout(() => controller.abort(), timeoutMs);
  let responseReceived = false;
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    responseReceived = true;
    if (!response.ok) throw new TboxError("http_error");
    return await consume(response);
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new TboxError("timeout");
    }
    if (error instanceof TboxError) throw error;
    if (!responseReceived) throw new TboxError("http_error");
    throw error;
  } finally {
    clock.clearTimeout(timer);
  }
}

function authorizationHeaders(apiKey: string) {
  return { Authorization: apiKey, "Content-Type": "application/json" };
}

function ensureChatConfig(deps: TboxDependencies) {
  if (!deps.config.apiKey || !deps.config.agentId || !deps.config.chatEndpoint) {
    throw new TboxError("missing_config");
  }
}

export async function consumeChatResponse<T>(
  input: ChatInput,
  stream: boolean,
  deps: TboxDependencies,
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  ensureChatConfig(deps);
  const url = new URL(deps.config.chatEndpoint);
  if (input.conversationId) url.searchParams.set("conversation_id", input.conversationId);
  const body: Record<string, unknown> = {
    agent_id: deps.config.agentId,
    question: input.question,
    user_id: input.userId,
    stream,
  };
  if (input.history !== undefined) body.history = input.history;
  if (input.context !== undefined) body.business_data = input.context;
  const headers: Record<string, string> = authorizationHeaders(deps.config.apiKey);
  if (stream) headers.Accept = "text/event-stream";
  return timedResponse(
    url,
    { method: "POST", headers, body: JSON.stringify(body) },
    deps,
    consume,
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
    throw new TboxError("missing_config");
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
