import type { TboxMode } from "@/lib/types";
import type { TboxConfig, TboxHistoryMode, TboxContextTransport, TboxStructuredMode } from "@/lib/tbox/types";

function read(name: string, fallback = "") {
  const value = process.env[name];
  return value?.trim() ? value : fallback;
}

function readBoolean(name: string, fallback: boolean) {
  const value = read(name).trim().toLowerCase();
  if (!value) return fallback;
  return value === "true";
}

function readRetrievalMode() {
  return read("TBOX_RETRIEVAL_MODE", "agent") === "hybrid" ? "hybrid" : "agent";
}

function readHistoryMode(): TboxHistoryMode {
  // fail-closed：安全默认 context_only；只有显式 "provider" 才启用，非法值落回安全默认
  const value = read("TBOX_HISTORY_MODE", "context_only").trim().toLowerCase();
  if (value === "provider") return "provider";
  return "context_only";
}

function readContextTransport(): TboxContextTransport {
  // fail-closed：安全默认 question_prefix
  const value = read("TBOX_CONTEXT_TRANSPORT", "question_prefix").trim().toLowerCase();
  if (value === "provider_history") return "provider_history";
  if (value === "business_data") return "business_data";
  return "question_prefix";
}

function readStructuredMode(): TboxStructuredMode {
  // ⚠️ 平台能力缺口：真实 TBox API 的 conversation.chat.completed 事件不含 structured 字段
  // terminal 仅 mock 环境可用；生产一律 disabled
  const value = read("TBOX_STRUCTURED_MODE", "disabled").trim().toLowerCase();
  if (value === "terminal") return "terminal";
  return "disabled";
}

export function getTboxConfig(): TboxConfig {
  const requestedMode = read("TBOX_MODE", "mock") as TboxMode;
  const mode: TboxMode = ["api", "manual", "mock"].includes(requestedMode)
    ? requestedMode
    : "mock";
  const configuredTimeout = Number(read("TBOX_STREAM_TIMEOUT_MS", "90000"));
  return {
    mode,
    apiKey: read("TBOX_API_KEY"),
    appId: read("TBOX_APP_ID"),
    agentId: read("TBOX_AGENT_ID"),
    agentVersion: read("TBOX_AGENT_VERSION") || undefined,
    searchEngine: readBoolean("TBOX_SEARCH_ENGINE", false),
    retrievalMode: readRetrievalMode(),
    historyMode: readHistoryMode(),
    contextTransport: readContextTransport(),
    structuredMode: readStructuredMode(),
    reuseRemoteConversationId: readBoolean("TBOX_REUSE_REMOTE_CONVERSATION_ID", false),
    chatEndpoint: read("TBOX_CHAT_ENDPOINT", "https://o.tbox.cn/openapi/v1/chat/create"),
    retrieveEndpoint: read("TBOX_RETRIEVE_ENDPOINT", "https://api.tbox.cn/api/datasets/retrieve"),
    streamTimeoutMs:
      Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 90_000,
    webServiceUrl: read("TBOX_WEB_SERVICE_URL"),
    probeAgentId: read("TBOX_PROBE_AGENT_ID") || undefined,
    datasetIds: {
      roleCompetency: read("TBOX_DATASET_ROLE_COMPETENCY"),
      learningResources: read("TBOX_DATASET_LEARNING_RESOURCES"),
      simulationScenes: read("TBOX_DATASET_SIMULATION_SCENES"),
      ethicsRules: read("TBOX_DATASET_ETHICS_RULES"),
      careerTrends: read("TBOX_DATASET_CAREER_TRENDS"),
    },
  };
}

export function isOpenChatEntry(): boolean {
  return readBoolean("OPEN_CHAT_ENTRY", true);
}

export function isStatefulChatTurns(): boolean {
  return readBoolean("STATEFUL_CHAT_TURNS", true);
}

export function isAgentOperationsEnabled(): boolean {
  // fail-closed: 默认 false
  // ⚠️ 生产不可用：依赖 TBox structured 输出（平台能力缺口），仅 mock 环境有效
  // 设置 AGENT_OPERATIONS_V1=true 前必须同时设置 TBOX_STRUCTURED_MODE=terminal + TBOX_MODE=mock
  return readBoolean("AGENT_OPERATIONS_V1", false);
}

export function isPlanV2WriteEnabled(): boolean {
  // fail-closed: 默认 false，与 .env.example 一致
  return readBoolean("PLAN_V2_WRITE", false);
}

export function isConversationSummaryEnabled(): boolean {
  return readBoolean("CONVERSATION_SUMMARY", false);
}

export function getPluginToken() {
  return read("CAREERMATE_PLUGIN_TOKEN");
}

/** Server-only HMAC key for short-lived Agentic V2 context tokens. */
export function getCareerMateContextTokenSecret() {
  return read("CAREERMATE_CONTEXT_TOKEN_SECRET");
}

/** Exact browser Origin allow-list for the public CareerMate MCP V2 endpoint. */
export function getCareerMateMcpAllowedOrigins(): string[] {
  return [...new Set(
    read("CAREERMATE_MCP_ALLOWED_ORIGINS")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  )];
}
