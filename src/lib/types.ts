import type { AiCareerPlanV2 } from "@/lib/plans/schema-v2";
import type { PlanTaskSummary, UnifiedPlanTask } from "@/lib/plans/task-model";

export type AbilityKey =
  | "aiTooling"
  | "roleFoundation"
  | "dataAnalysis"
  | "businessProduct"
  | "communication"
  | "projectPractice";

export type AbilityScores = Record<AbilityKey, number>;

export const abilityLabels: Record<AbilityKey, string> = {
  aiTooling: "AI 理解与工具应用",
  roleFoundation: "岗位专业基础",
  dataAnalysis: "数据分析能力",
  businessProduct: "业务/产品理解",
  communication: "沟通协作表达",
  projectPractice: "项目实践与作品沉淀",
};

export const abilityKeys = Object.keys(abilityLabels) as AbilityKey[];

export type AiMode = "api" | "manual" | "mock";

export type TboxMode = AiMode;

export interface AiExecutionMeta {
  requestedMode: AiMode;
  actualMode: AiMode;
  degraded: boolean;
  fallbackReason: string | null;
  source: string;
}

export interface ProfileDto {
  id: string;
  userId: string;
  educationStage: string | null;
  major: string | null;
  targetRole: string | null;
  targetRoleLabel: string | null;
  weeklyAvailableHours: number | null;
  learningPreference: string[];
  experienceSummary: string;
  interestTags: string[];
  constraints: string[];
  abilityScores: Partial<AbilityScores>;
  memoryEnabled: boolean;
  onboardingCompleted: boolean;
  version: number;
  introStatus: string;
  updatedAt: string;
}

/** 完整画像——用于需要目标岗位和时间的操作（如计划生成） */
export type PlanReadyProfile = ProfileDto & {
  targetRole: string;
  targetRoleLabel: string;
  weeklyAvailableHours: number;
};

export function isPlanReadyProfile(profile: ProfileDto): profile is PlanReadyProfile {
  return Boolean(
    profile.targetRole?.trim() &&
    profile.targetRoleLabel?.trim() &&
    profile.weeklyAvailableHours != null &&
    Number.isInteger(profile.weeklyAvailableHours) &&
    Number(profile.weeklyAvailableHours) > 0,
  );
}

export interface CurrentUserDto {
  id: string;
  username: string;
  displayName: string;
  avatarDataUrl: string | null;
  role: string;
}

export interface CareerPlanDto {
  id: string;
  targetRole: string;
  version: number;
  status: string;
  /** V1 兼容字段（V2 计划中为空数组） */
  years: Array<Record<string, unknown>>;
  /** V1 兼容字段（V2 计划中为空数组） */
  quarters: Array<Record<string, unknown>>;
  /** V1 兼容字段（V2 计划中为空数组） */
  months: Array<Record<string, unknown>>;
  currentMonthIndex: number;
  assumptions: string[];
  riskNotes: string[];
  generationMeta: PlanGenerationMeta;
  sourceReportId: string | null;
  /** Plan V2：schema 版本号（1=V1固定36月，2=V2灵活周期） */
  schemaVersion: number;
  /** Plan V2：AI 返回的完整计划 JSON 字符串 */
  content: string | null;
  /** Plan V2：目标岗位显示名称 */
  targetRoleLabel: string | null;
  /**
   * 共享任务模型（V1/V2 统一读取）。概览、路径和资源上下文只读这一份，
   * 不再各自解析 months 或 content。
   */
  tasks?: UnifiedPlanTask[];
  /** 与 tasks 同一算法版本生成的统计；未知值不会伪装成 0。 */
  taskSummary?: PlanTaskSummary;
  /** V2 原始计划（校验通过时）；用于路径页展示灵活阶段。 */
  v2?: AiCareerPlanV2 | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanGenerationMeta {
  requestedMode: string;
  actualMode: string;
  degraded: boolean;
  fallbackReason: string | null;
  source: string;
  triggeredBy: "chat" | "manual" | "auto";
  conversationId?: string;
}

export const taskStatuses = ["not_started", "in_progress", "done", "delayed"] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const taskStatusLabels: Record<TaskStatus, string> = {
  not_started: "未开始",
  in_progress: "进行中",
  done: "已完成",
  delayed: "已延期",
};

export interface PlanTask {
  id: string;
  title: string;
  type: string;
  status: TaskStatus;
  dueWeek?: number;
}

export interface PlanMonth {
  monthIndex: number;
  goal: string;
  learningTasks: PlanTask[];
  practiceOutputs: string[];
  evaluationMetrics: string[];
}

/** 种子职业 key（不作为白名单，仅初始选项） */
export const seedRoleKeys = ["database_administrator", "ai_product_manager", "data_analyst", "aigc_operator"] as const;
export type SeedRoleKey = (typeof seedRoleKeys)[number];

export const resourceTypes = ["course", "practice", "project", "template"] as const;
export type ResourceType = (typeof resourceTypes)[number];

export const resourceTypeLabels: Record<ResourceType, string> = {
  course: "课程",
  practice: "实践",
  project: "项目",
  template: "模板",
};

export interface ResourceItemDto {
  id: string;
  externalKey?: string | null;
  title: string;
  type: string;
  roleKey: string;
  abilityKey: string;
  stage: string;
  source: string;
  provider?: string | null;
  difficulty?: string | null;
  url?: string | null;
  estimatedHours?: number | null;
  description: string;
  detail?: string;
  steps?: string[];
  deliverables?: string[];
  acceptanceCriteria?: string[];
  verificationStatus?: string;
  lastVerifiedAt?: string | null;
  validUntil?: string | null;
  sourceFile?: string | null;
  sourceBatch?: string | null;
  status?: string;
}

export interface JobSampleDto {
  id: string;
  jobId: string;
  roleKey: string | null;
  title: string;
  company: string | null;
  city: string;
  experience: string | null;
  education: string | null;
  salaryRaw: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryUnit: string | null;
  salaryMonths: number | null;
  salaryComparable: boolean;
  salaryNote: string;
  skills: string[];
  jobLink: string | null;
  jd: string;
  sourceFile: string[];
  sourceBatch: string;
  collectedAt: string | null;
  collectionDateApprox: boolean;
  verificationStatus: string;
  detailAvailable: boolean;
  fieldConflicts: Array<{ field: string; values: Array<{ value: string; sourceFiles: string[] }> }>;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateDto {
  id: string;
  source: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  confidence: number;
  reason: string;
  status: string;
  createdAt: string;
  sourceConversationId: string | null;
  evidenceExcerpt: string;
  impactSummary: string;
  abilityEvidenceId: string | null;
}

export interface AbilityEvidenceDto {
  id: string;
  userId: string;
  abilityKey: string;
  summary: string;
  sourceType: string;
  sourceRef: string | null;
  confidence: number;
  status: string;
  observedAt: string;
  createdAt: string;
}

// ── 统一计划结构 ──────────────────────────────────────

export interface UnifiedPlan {
  direction: PlanDirection;
  milestones: PlanMilestone[];
  tasks: PlanTask90;
  thisWeek: PlanWeeklyAction[];
}

export interface PlanDirection {
  summary: string;
  targetRole: string;
  keyCompetencies: string[];
}

export interface PlanMilestone {
  month: number;
  goal: string;
  deliverables: string[];
  evaluationCriteria: string[];
}

export interface PlanTask90 {
  goal: string;
  tasks: Array<{
    id: string;
    title: string;
    type: string;
    status: string;
    dueWeek: number;
    estimatedHours?: number;
  }>;
}

export interface PlanWeeklyAction {
  title: string;
  description: string;
  estimatedMinutes: number;
  type: "learning" | "practice" | "output" | "review";
}

export interface PlanVersionDiff {
  directionChange: boolean;
  directionSummary?: string;
  addedMilestones: PlanMilestone[];
  removedMilestones: PlanMilestone[];
  addedTasks: string[];
  removedTasks: string[];
  timeCommitmentChange?: string;
  riskChange?: string;
}
