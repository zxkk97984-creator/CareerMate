import { toJson } from "@/lib/json";

/** 新用户空画像——不写入任何假事实，未确认字段为 null */
export function createIncompleteProfileDefaults() {
  return {
    educationStage: null,
    major: null,
    targetRole: null,
    targetRoleLabel: null,
    weeklyAvailableHours: null,
    learningPreference: toJson([]),
    experienceSummary: "",
    interestTags: toJson([]),
    constraints: toJson([]),
    onboardingCompleted: false,
    introStatus: "not_started",
    abilityScores: toJson({}),
  };
}
