import { toJson } from "@/lib/json";

export function createIncompleteProfileDefaults() {
  return {
    educationStage: "junior",
    major: "",
    targetRole: "ai_product_manager",
    targetRoleLabel: "AI 产品经理",
    weeklyAvailableHours: 5,
    learningPreference: toJson(["project", "practice"]),
    experienceSummary: "新用户，等待 CareerMate 完成画像采集。",
    interestTags: toJson(["AI 工具", "职业探索"]),
    constraints: toJson([]),
    onboardingCompleted: false,
    abilityScores: toJson({
      aiTooling: 45,
      roleFoundation: 35,
      dataAnalysis: 35,
      businessProduct: 40,
      communication: 45,
      projectPractice: 30,
    }),
  };
}
