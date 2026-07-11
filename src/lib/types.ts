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
  educationStage: string;
  major: string | null;
  targetRole: string;
  targetRoleLabel: string;
  weeklyAvailableHours: number;
  learningPreference: string[];
  experienceSummary: string;
  interestTags: string[];
  constraints: string[];
  abilityScores: AbilityScores;
  memoryEnabled: boolean;
  onboardingCompleted: boolean;
  updatedAt: string;
}

export interface CurrentUserDto {
  id: string;
  username: string;
  displayName: string;
  role: string;
}

export interface CareerPlanDto {
  id: string;
  targetRole: string;
  version: number;
  status: string;
  years: Array<Record<string, unknown>>;
  quarters: Array<Record<string, unknown>>;
  months: Array<Record<string, unknown>>;
  currentMonthIndex: number;
  assumptions: string[];
  riskNotes: string[];
  createdAt: string;
  updatedAt: string;
}

export const taskStatuses = ["not_started", "in_progress", "done", "delayed"] as const;
export type TaskStatus = (typeof taskStatuses)[number];

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

export const supportedRoleKeys = ["ai_product_manager", "data_analyst", "aigc_operator"] as const;
export type SupportedRoleKey = (typeof supportedRoleKeys)[number];

export const resourceTypes = ["course", "practice", "project", "template"] as const;
export type ResourceType = (typeof resourceTypes)[number];

export interface ResourceItemDto {
  id: string;
  title: string;
  type: string;
  roleKey: string;
  abilityKey: string;
  stage: string;
  source: string;
  url?: string | null;
  estimatedHours?: number | null;
  description: string;
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
