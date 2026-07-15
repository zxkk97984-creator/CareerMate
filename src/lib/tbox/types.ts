import type { AiExecutionMeta, AiMode } from "@/lib/types";

export type { AiExecutionMeta, AiMode };

export type DatasetKey =
  | "roleCompetency"
  | "learningResources"
  | "simulationScenes"
  | "ethicsRules"
  | "careerTrends";

/** 百宝箱 history 传输模式 */
export type TboxHistoryMode = "provider" | "context_only";

/** 百宝箱业务上下文传输方式 */
export type TboxContextTransport = "business_data" | "question_prefix";

/** 百宝箱结构化输出模式 */
export type TboxStructuredMode = "disabled" | "terminal" | "followup";

export interface TboxConfig {
  mode: AiMode;
  apiKey: string;
  appId?: string;
  agentId: string;
  agentVersion?: string;
  searchEngine: boolean;
  retrievalMode: "agent" | "hybrid";
  historyMode: TboxHistoryMode;
  contextTransport: TboxContextTransport;
  structuredMode: TboxStructuredMode;
  reuseRemoteConversationId: boolean;
  chatEndpoint: string;
  retrieveEndpoint: string;
  streamTimeoutMs: number;
  webServiceUrl?: string;
  probeAgentId?: string;
  datasetIds: Record<DatasetKey, string>;
}

export interface AiResult<T> {
  data: T;
  meta: AiExecutionMeta;
}

/** 百宝箱 history 消息格式 */
export interface TboxHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatInput {
  question: string;
  userId: string;
  conversationId?: string;
  /** 最近对话历史（最多12条，8000字符） */
  history?: TboxHistoryMessage[];
  /** 结构化业务上下文（business_data 传输模式下使用） */
  context?: unknown;
  /** per-turn 搜索策略，只有 "required" 且全局开关开启时才实际发送 search_engine=true */
  searchPolicy?: "off" | "allowed" | "required";
}

export interface NormalizedChat {
  conversationId: string | null;
  answer: string;
}

export interface RetrievalItem {
  content: string;
  source: string;
  score: number;
}

export interface Clock {
  setTimeout(callback: () => void, timeoutMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}

export interface TboxDependencies {
  config: TboxConfig;
  fetchImpl?: typeof fetch;
  clock?: Clock;
  signal?: AbortSignal;
  /** 仅测试用：设为 true 可绕过端点白名单校验，生产代码永远不设置 */
  allowTestEndpoint?: boolean;
}

export type NormalizedStreamEvent =
  | { event: "message"; data: { type: "delta"; content: string; meta?: AiExecutionMeta } }
  | { event: "done"; data: { conversationId: string | null; meta?: AiExecutionMeta } }
  | { event: "error"; data: { type: "error"; message: string; meta?: AiExecutionMeta } };

// ── 统一内部事件与结果类型 ─────────────────────────────

/** SSE 归一化后的内部事件（替代 NormalizedStreamEvent 用于内部处理） */
export type NormalizedAiEvent =
  | { type: "conversation"; conversationId: string }
  | { type: "text_delta"; text: string }
  | { type: "text_final"; text: string }
  | { type: "tool_start"; name?: string }
  | { type: "tool_end"; name?: string; payload?: unknown }
  | { type: "structured_result"; payload: unknown }
  | { type: "citation"; payload: unknown }
  | { type: "warning"; code: string }
  | { type: "error"; code: string; message: string }
  | { type: "done" };

/** 累积后的最终助手结果 */
export interface NormalizedAssistantResult {
  text: string;
  structured?: unknown;
  citations: unknown[];
  conversationId?: string;
  warnings: string[];
}

// ── 工作流与知识库配置类型 ─────────────────────────────

export type WorkflowType =
  | "career_exploration"
  | "profile_candidate"
  | "role_research"
  | "plan_generation"
  | "simulation_training";

export interface WorkflowConfig {
  type: WorkflowType;
  name: string;
  description: string;
  /** 工作流依赖的知识库 */
  knowledgeBases: DatasetKey[];
  /** 是否允许降级到 manual/mock */
  allowDegradation: boolean;
  /** 结构化输出的 Zod schema 名称（本地校验用） */
  outputSchema: string;
}

export interface KnowledgeBaseConfig {
  key: DatasetKey;
  name: string;
  description: string;
  /** 知识库内容来源说明 */
  sourceDescription: string;
  /** 最后更新日期 */
  lastUpdated: string;
}
