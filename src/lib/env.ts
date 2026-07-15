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
  // 安全默认 context_only，只有真实隔离探针通过 history 后才改为 provider
  const value = read("TBOX_HISTORY_MODE", "context_only").trim().toLowerCase();
  return value === "context_only" ? "context_only" : "provider";
}

function readContextTransport(): TboxContextTransport {
  // 安全默认 question_prefix（business_data 探针未通过）
  const value = read("TBOX_CONTEXT_TRANSPORT", "question_prefix").trim().toLowerCase();
  return value === "question_prefix" ? "question_prefix" : "business_data";
}

function readStructuredMode(): TboxStructuredMode {
  // 安全默认 disabled（terminal 和 followup 探针均未通过）
  const value = read("TBOX_STRUCTURED_MODE", "disabled").trim().toLowerCase();
  if (value === "terminal") return "terminal";
  if (value === "followup") return "followup";
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
  return readBoolean("AGENT_OPERATIONS_V1", false);
}

export function isPlanV2WriteEnabled(): boolean {
  return readBoolean("PLAN_V2_WRITE", false);
}

export function isConversationSummaryEnabled(): boolean {
  return readBoolean("CONVERSATION_SUMMARY", false);
}

export function getPluginToken() {
  return read("CAREERMATE_PLUGIN_TOKEN");
}
