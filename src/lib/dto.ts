import type {
  AbilityScores,
  CandidateDto,
  CareerPlanDto,
  CurrentUserDto,
  PlanGenerationMeta,
  ProfileDto,
  JobSampleDto,
  ResourceItemDto,
} from "@/lib/types";
import { parseJson } from "@/lib/json";
import { convertV2ToV1Arrays } from "@/lib/plans/compatibility";
import type { CareerPlanRow } from "@/lib/plans/compatibility";
import { planTaskSummaryFromRow } from "@/lib/plans/task-model";

export function userDto(user: {
  id: string;
  username: string;
  displayName: string;
  avatarDataUrl?: string | null;
  role: string;
}): CurrentUserDto {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarDataUrl: user.avatarDataUrl ?? null,
    role: user.role,
  };
}

export function profileDto(profile: {
  id: string;
  userId: string;
  educationStage: string | null;
  major: string | null;
  targetRole: string | null;
  targetRoleLabel: string | null;
  weeklyAvailableHours: number | null;
  learningPreference: string;
  experienceSummary: string;
  interestTags: string;
  constraints: string;
  abilityScores: string;
  memoryEnabled: boolean;
  onboardingCompleted: boolean;
  version?: number;
  introStatus?: string;
  updatedAt: Date;
}): ProfileDto {
  return {
    id: profile.id,
    userId: profile.userId,
    educationStage: profile.educationStage || null,
    major: profile.major || null,
    targetRole: profile.targetRole || null,
    targetRoleLabel: profile.targetRoleLabel || null,
    weeklyAvailableHours: profile.weeklyAvailableHours ?? null,
    learningPreference: parseJson<string[]>(profile.learningPreference, []),
    experienceSummary: profile.experienceSummary,
    interestTags: parseJson<string[]>(profile.interestTags, []),
    constraints: parseJson<string[]>(profile.constraints, []),
    abilityScores: parseJson<AbilityScores>(profile.abilityScores, {} as AbilityScores),
    memoryEnabled: profile.memoryEnabled,
    onboardingCompleted: profile.onboardingCompleted,
    version: profile.version ?? 1,
    introStatus: profile.introStatus ?? "not_started",
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export function planDto(plan: {
  id: string;
  targetRole: string;
  version: number;
  status: string;
  years: string;
  quarters: string;
  months: string;
  currentMonthIndex: number;
  assumptions: string;
  riskNotes: string;
  generationMeta: string;
  sourceReportId: string | null;
  schemaVersion?: number;
  content?: string | null;
  targetRoleLabel?: string | null;
  createdAt: Date;
  updatedAt: Date;
}, options: { weeklyBudgetHours?: number | null } = {}): CareerPlanDto {
  // V2 计划读取时若缺少 V1 数组则从 content 转换
  let years = parseJson<Array<Record<string, unknown>>>(plan.years, []);
  let quarters = parseJson<Array<Record<string, unknown>>>(plan.quarters, []);
  let months = parseJson<Array<Record<string, unknown>>>(plan.months, []);
  let currentMonthIndex = plan.currentMonthIndex;

  if ((plan.schemaVersion ?? 1) >= 2 && months.length === 0 && plan.content) {
    try {
      const v2 = JSON.parse(plan.content);
      const v1Arrays = convertV2ToV1Arrays(v2);
      years = v1Arrays.years as unknown as Array<Record<string, unknown>>;
      quarters = v1Arrays.quarters as unknown as Array<Record<string, unknown>>;
      months = v1Arrays.months as unknown as Array<Record<string, unknown>>;
      currentMonthIndex = v1Arrays.currentMonthIndex;
    } catch { /* 转换失败则使用空数组 */ }
  }

  const taskModel = planTaskSummaryFromRow(
    plan as unknown as CareerPlanRow,
    options.weeklyBudgetHours ?? null,
  );

  return {
    id: plan.id,
    targetRole: plan.targetRole,
    version: plan.version,
    status: plan.status,
    years,
    quarters,
    months,
    currentMonthIndex,
    assumptions: parseJson<string[]>(plan.assumptions, []),
    riskNotes: parseJson<string[]>(plan.riskNotes, []),
    generationMeta: parseJson<PlanGenerationMeta>(plan.generationMeta, {
      requestedMode: "mock",
      actualMode: "mock",
      degraded: false,
      fallbackReason: null,
      source: "unknown",
      triggeredBy: "manual" as const,
    }),
    sourceReportId: plan.sourceReportId,
    schemaVersion: plan.schemaVersion ?? 1,
    content: plan.content ?? null,
    targetRoleLabel: plan.targetRoleLabel ?? null,
    tasks: taskModel.tasks,
    taskSummary: taskModel.summary,
    v2: taskModel.planV2,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

export function candidateDto(candidate: {
  id: string;
  source: string;
  field: string;
  oldValue: string;
  newValue: string;
  confidence: number;
  reason: string;
  status: string;
  createdAt: Date;
  sourceConversationId?: string | null;
  evidenceExcerpt?: string;
  impactSummary?: string;
  abilityEvidenceId?: string | null;
}): CandidateDto {
  return {
    id: candidate.id,
    source: candidate.source,
    field: candidate.field,
    oldValue: parseJson<unknown>(candidate.oldValue, null),
    newValue: parseJson<unknown>(candidate.newValue, null),
    confidence: candidate.confidence,
    reason: candidate.reason,
    status: candidate.status,
    createdAt: candidate.createdAt.toISOString(),
    sourceConversationId: candidate.sourceConversationId ?? null,
    evidenceExcerpt: candidate.evidenceExcerpt ?? "",
    impactSummary: candidate.impactSummary ?? "",
    abilityEvidenceId: candidate.abilityEvidenceId ?? null,
  };
}

export function resourceDto(resource: {
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
  steps?: string;
  deliverables?: string;
  acceptanceCriteria?: string;
  verificationStatus?: string;
  lastVerifiedAt?: Date | null;
  validUntil?: Date | null;
  sourceFile?: string | null;
  sourceBatch?: string | null;
  status?: string;
}): ResourceItemDto {
  return {
    id: resource.id,
    externalKey: resource.externalKey ?? null,
    title: resource.title,
    type: resource.type,
    roleKey: resource.roleKey,
    abilityKey: resource.abilityKey,
    stage: resource.stage,
    source: resource.source,
    provider: resource.provider ?? null,
    difficulty: resource.difficulty ?? null,
    url: resource.url ?? null,
    estimatedHours: resource.estimatedHours ?? null,
    description: resource.description,
    detail: resource.detail ?? "",
    steps: parseJson<string[]>(resource.steps ?? "[]", []),
    deliverables: parseJson<string[]>(resource.deliverables ?? "[]", []),
    acceptanceCriteria: parseJson<string[]>(resource.acceptanceCriteria ?? "[]", []),
    verificationStatus: resource.verificationStatus ?? "unverified",
    lastVerifiedAt: resource.lastVerifiedAt?.toISOString() ?? null,
    validUntil: resource.validUntil?.toISOString() ?? null,
    sourceFile: resource.sourceFile ?? null,
    sourceBatch: resource.sourceBatch ?? null,
    status: resource.status ?? "active",
  };
}

export function jobSampleDto(job: {
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
  skills: string;
  jobLink: string | null;
  jd: string;
  sourceFile: string;
  sourceBatch: string;
  collectedAt: Date | null;
  collectionDateApprox: boolean;
  verificationStatus: string;
  detailAvailable: boolean;
  fieldConflicts: string;
  createdAt: Date;
  updatedAt: Date;
}): JobSampleDto {
  return {
    id: job.id,
    jobId: job.jobId,
    roleKey: job.roleKey,
    title: job.title,
    company: job.company,
    city: job.city,
    experience: job.experience,
    education: job.education,
    salaryRaw: job.salaryRaw,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryUnit: job.salaryUnit,
    salaryMonths: job.salaryMonths,
    salaryComparable: job.salaryComparable,
    salaryNote: job.salaryNote,
    skills: parseJson<string[]>(job.skills, []),
    jobLink: job.jobLink,
    jd: job.jd,
    sourceFile: parseJson<string[]>(job.sourceFile, [job.sourceFile]),
    sourceBatch: job.sourceBatch,
    collectedAt: job.collectedAt?.toISOString() ?? null,
    collectionDateApprox: job.collectionDateApprox,
    verificationStatus: job.verificationStatus,
    detailAvailable: job.detailAvailable,
    fieldConflicts: parseJson<JobSampleDto["fieldConflicts"]>(job.fieldConflicts, []),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
