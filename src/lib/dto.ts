import type {
  AbilityScores,
  CandidateDto,
  CareerPlanDto,
  CurrentUserDto,
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
  educationStage: string;
  major: string | null;
  targetRole: string;
  targetRoleLabel: string;
  weeklyAvailableHours: number;
  learningPreference: string;
  experienceSummary: string;
  interestTags: string;
  constraints: string;
  abilityScores: string;
  memoryEnabled: boolean;
  onboardingCompleted: boolean;
  updatedAt: Date;
}): ProfileDto {
  return {
    ...profile,
    learningPreference: parseJson<string[]>(profile.learningPreference, []),
    interestTags: parseJson<string[]>(profile.interestTags, []),
    constraints: parseJson<string[]>(profile.constraints, []),
    abilityScores: parseJson<AbilityScores>(profile.abilityScores, {
      aiTooling: 0,
      roleFoundation: 0,
      dataAnalysis: 0,
      businessProduct: 0,
      communication: 0,
      projectPractice: 0,
    }),
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
  };
}
