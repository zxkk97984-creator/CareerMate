import type { AiExecutionMeta, AiMode } from "@/lib/types";

export type { AiExecutionMeta, AiMode };

export type DatasetKey =
  | "roleCompetency"
  | "learningResources"
  | "simulationScenes"
  | "ethicsRules";

export interface TboxConfig {
  mode: AiMode;
  apiKey: string;
  appId?: string;
  agentId: string;
  chatEndpoint: string;
  retrieveEndpoint: string;
  streamTimeoutMs: number;
  webServiceUrl?: string;
  datasetIds: Record<DatasetKey, string>;
}

export interface AiResult<T> {
  data: T;
  meta: AiExecutionMeta;
}

export interface ChatInput {
  question: string;
  userId: string;
  conversationId?: string;
  history?: unknown;
  context?: unknown;
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
}

export type NormalizedStreamEvent =
  | { event: "message"; data: { type: "delta"; content: string; meta?: AiExecutionMeta } }
  | { event: "done"; data: { conversationId: string | null; meta?: AiExecutionMeta } }
  | { event: "error"; data: { type: "error"; message: string; meta?: AiExecutionMeta } };

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
