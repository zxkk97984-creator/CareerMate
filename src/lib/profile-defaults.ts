import { toJson } from "@/lib/json";

/** 新用户空画像——不写入任何假事实 */
export function createIncompleteProfileDefaults() {
  return {
    educationStage: "",
    major: "",
    targetRole: "",
    targetRoleLabel: "",
    weeklyAvailableHours: 0,
    learningPreference: toJson([]),
    experienceSummary: "",
    interestTags: toJson([]),
    constraints: toJson([]),
    onboardingCompleted: false,
    introStatus: "not_started",
    abilityScores: toJson({}),
  };
}
