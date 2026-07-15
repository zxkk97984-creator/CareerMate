import type {
  AbilityScores,
  CandidateDto,
  CareerPlanDto,
  CurrentUserDto,
  PlanGenerationMeta,
  ProfileDto,
} from "@/lib/types";
import { parseJson } from "@/lib/json";

export function userDto(user: { id: string; username: string; displayName: string; role: string }): CurrentUserDto {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
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
}): CareerPlanDto {
  return {
    id: plan.id,
    targetRole: plan.targetRole,
    version: plan.version,
    status: plan.status,
    years: parseJson<Array<Record<string, unknown>>>(plan.years, []),
    quarters: parseJson<Array<Record<string, unknown>>>(plan.quarters, []),
    months: parseJson<Array<Record<string, unknown>>>(plan.months, []),
    currentMonthIndex: plan.currentMonthIndex,
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
