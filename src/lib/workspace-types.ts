import type { AiRuntimeSnapshot } from "@/lib/ai-runtime";
import type { ActiveOnboardingConversation } from "@/lib/onboarding-resume";
import type { AiExecutionMeta, CareerPlanDto, ProfileDto, ResourceItemDto } from "@/lib/types";
import { abilityKeys } from "@/lib/types";

/** 工作台视图标识 */
export type View = "onboarding" | "dashboard" | "path" | "simulation" | "resources" | "memory" | "admin";

/** 通用 API 响应 */
export interface ApiPayload<T> {
  ok: boolean;
  data: T;
  error?: { message: string };
  meta?: AiExecutionMeta;
}

/** API 返回元信息：分页/requestId 与 AI 执行来源是不同的字段语义，勿混用。
 * 当响应携带 AI 执行信息时，旧接口直接把这些字段铺在 meta 顶层；新接口应放 aiExecution。 */
export interface ApiMeta {
  requestId?: string;
  page?: number;
  nextCursor?: string | null;
  degraded?: boolean;
  aiExecution?: AiExecutionMeta;
  requestedMode?: "api" | "mock" | "manual";
  actualMode?: "api" | "mock" | "manual";
  fallbackReason?: string | null;
  source?: string;
}

/**
 * 客户端 API 可判别联合（plan 2.4）：HTTP 状态与 body.ok 分离，不再把 HTTP 200 与业务失败混为一谈。
 * 网络失败用 status=0 并明确 code；AbortError 走取消分支，不当作服务错误。
 */
export type ApiResult<T> =
  | { ok: true; data: T; status: number; meta?: ApiMeta }
  | { ok: false; status: number; error: { code: string; message: string; requestId?: string } };

/** 岗位匹配数据 */
export interface MatchData {
  /** 成长参考分 /100；信息不足时为 null（不臆造 0） */
  score: number | null;
  explanation: string;
  weakAbilities: Array<(typeof abilityKeys)[number]>;
  /** 有岗位权重但无能力记录的维度（未评估，不参与猜排名） */
  unassessed?: string[];
  /** 各维度明细：值、权重、补弱优先级，供“查看依据” */
  breakdown?: Array<{ key: string; label: string; value?: number; weight: number; gap?: number }>;
  hasInsufficientData?: boolean;
}

/** 成长日志条目 */
export interface ProgressLogData {
  id: string;
  eventType: string;
  title: string;
  summary: string;
  createdAt: string;
}

/** 工作台聚合状态 */
export interface WorkspaceData {
  user: { id: string; displayName: string; username: string; role: string } | null;
  profile: ProfileDto | null;
  plan: CareerPlanDto | null;
  pendingPlan: CareerPlanDto | null;
  planExecutionMeta: AiExecutionMeta | null;
  resources: ResourceItemDto[];
  memories: any[];
  candidates: any[];
  v2Candidates?: any[]; // AgentArtifactCandidate 待确认列表
  simulations: any[];
  drafts: any[];
  templates: any[];
  match: MatchData | null;
  recentProgressLogs: ProgressLogData[];
  aiRuntime: AiRuntimeSnapshot;
  activeOnboardingConversation: ActiveOnboardingConversation | null;
}

/** 画像引导消息 */
export interface OnboardingMessage {
  role: "user" | "assistant";
  content: string;
}
