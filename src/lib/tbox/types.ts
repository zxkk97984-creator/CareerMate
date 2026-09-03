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
export type TboxContextTransport = "provider_history" | "business_data" | "question_prefix";

/** 百宝箱结构化输出模式
 *  - disabled: 不请求/不解析结构化输出
 *  - terminal: 期望 conversation.chat.completed 事件携带 structured 字段
 *  ⚠️ 平台能力缺口（2026-07）：真实 TBox API 的 completed 事件不含 structured 字段，
 *     terminal 模式仅 mock 环境可用，生产环境务必设为 disabled。
 *     followup 模式已移除——独立结构化请求同样不可用。
 */
export type TboxStructuredMode = "disabled" | "terminal";

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
  /** Per-turn search policy: enabled unless explicitly "off". */
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
  | { type: "tool_start"; name?: string; toolType?: string; toolId?: string; tool?: string; toolDescription?: string; toolParameters?: unknown }
  | { type: "tool_end"; name?: string; toolType?: string; toolId?: string; resultSummary?: string; toolDescription?: string }
  | { type: "agentic_event"; subtype: string; payload?: unknown }
  | { type: "citation"; payload: unknown }
  | { type: "warning"; code: string }
  | { type: "error"; code: string; message: string }
  | { type: "done" };

/** 单次工具调用记录 */
export interface ToolCallRecord {
  toolType: string;
  toolId: string;
  /** 工具名称（如 web_content_extractor、query_search、finish_subtask 等） */
  tool?: string;
  toolDescription?: string;
  toolParameters?: unknown;
  resultSummary?: string;
}

/** 累积后的最终助手结果 */
export interface NormalizedAssistantResult {
  text: string;
  /** 真实 API 不返回 structured_result 事件——此字段保留用于子工作流输出，但通常为 undefined */
  structured?: unknown;
  citations: unknown[];
  conversationId?: string;
  warnings: string[];
  /** 真实 Agentic 工具调用记录（从 agentic_tool_start/end 事件累积） */
  toolCalls?: ToolCallRecord[];
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
