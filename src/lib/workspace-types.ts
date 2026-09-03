import type { AiRuntimeSnapshot } from "@/lib/ai-runtime";
import type { ActiveOnboardingConversation } from "@/lib/onboarding-resume";
import type { AiExecutionMeta, CareerPlanDto, ProfileDto, ResourceItemDto } from "@/lib/types";
import { abilityKeys } from "@/lib/types";

/** 工作台视图标识 */
export type View = "onboarding" | "dashboard" | "path" | "simulation" | "resources" | "memory" | "chat" | "admin";

/** 通用 API 响应 */
export interface ApiPayload<T> {
  ok: boolean;
  data: T;
  error?: { message: string };
  meta?: AiExecutionMeta;
}

/** 岗位匹配数据 */
export interface MatchData {
  score: number;
  explanation: string;
  weakAbilities: Array<(typeof abilityKeys)[number]>;
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
