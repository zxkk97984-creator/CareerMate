import type { AiExecutionMeta } from "@/lib/types";

export type CareerChatIntent =
  | "roleCompetency"
  | "learningResources"
  | "simulationScenes"
  | "ethicsRules";

export interface SafeCareerProfile {
  educationStage?: string;
  major?: string;
  targetRole?: string;
  targetRoleLabel?: string;
  weeklyAvailableHours?: number;
  learningPreference?: string[];
  abilityScores?: Record<string, number>;
}

export interface SafeCurrentPlan {
  targetRole?: string;
  currentMonthIndex?: number;
  goal?: string;
  pendingTasks: string[];
  assumptions: string[];
  riskNotes: string[];
}

export interface SafeCareerContext {
  profile: SafeCareerProfile | null;
  currentPlan: SafeCurrentPlan | null;
  memories: string[];
}

export interface CareerChatContextMeta {
  intent: CareerChatIntent | null;
  usedProfile: boolean;
  usedPlan: boolean;
  usedMemoryCount: number;
  knowledgeSources: string[];
  retrievalMeta: AiExecutionMeta | null;
}
