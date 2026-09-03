/** 客户端安全的 onboarding 纯函数与 schema——不依赖 node:crypto */

import { z } from "zod";

const cleanText = z.string().trim().min(1).max(240);
const cleanList = z
  .array(cleanText)
  .max(12)
  .transform((items) => [...new Set(items)]);

export const onboardingDraftSchema = z
  .object({
    educationStage: cleanText.optional(),
    major: cleanText.optional(),
    targetRole: z.string().trim().min(1).max(120).optional(),
    targetRoleLabel: cleanText.optional(),
    weeklyAvailableHours: z.number().int().min(1).max(40).optional(),
    learningPreference: cleanList.optional(),
    experienceSummary: cleanText.max(1_000).optional(),
    constraints: cleanList.optional(),
  })
  .strict();

export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>;

const completeGroup = (value: unknown) =>
  typeof value === "string" ? value.trim().length > 0 : Array.isArray(value) ? value.length > 0 : value !== undefined;

export function missingOnboardingGroups(draft: OnboardingDraft) {
  return [
    !completeGroup(draft.educationStage) && "educationStage",
    !completeGroup(draft.major) && "major",
    !(completeGroup(draft.targetRole) && completeGroup(draft.targetRoleLabel)) && "targetRole",
    !(typeof draft.weeklyAvailableHours === "number" && draft.weeklyAvailableHours >= 1 && draft.weeklyAvailableHours <= 40) && "weeklyAvailableHours",
    !completeGroup(draft.learningPreference) && "learningPreference",
    !completeGroup(draft.experienceSummary) && "experienceSummary",
    !completeGroup(draft.constraints) && "constraints",
  ].filter((value): value is string => Boolean(value));
}

export function calculateOnboardingCompleteness(draft: OnboardingDraft) {
  return (7 - missingOnboardingGroups(draft).length) / 7;
}

export function canCompleteOnboarding(completeness: number) {
  return completeness >= 0.8;
}
