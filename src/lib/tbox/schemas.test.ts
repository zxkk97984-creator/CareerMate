import { describe, expect, it } from "vitest";
import { buildCareerPlan } from "@/lib/career";
import type { ProfileDto } from "@/lib/types";
import { careerPlanSchema } from "./schemas";

const profile: ProfileDto = {
  id: "profile-1",
  userId: "user-1",
  educationStage: "junior",
  major: "统计学",
  targetRole: "data_analyst",
  targetRoleLabel: "数据分析师",
  weeklyAvailableHours: 6,
  learningPreference: ["project"],
  experienceSummary: "",
  interestTags: [],
  constraints: [],
  abilityScores: {
    aiTooling: 60,
    roleFoundation: 60,
    dataAnalysis: 60,
    businessProduct: 60,
    communication: 60,
    projectPractice: 60,
  },
  memoryEnabled: true,
  updatedAt: "2026-07-10T00:00:00.000Z",
};

describe("career plan schema", () => {
  it("accepts a deterministic 3-role-compatible 36-month plan", () => {
    expect(careerPlanSchema.safeParse(buildCareerPlan(profile)).success).toBe(true);
  });

  it("rejects plans with missing months", () => {
    const withoutMonths: Partial<ReturnType<typeof buildCareerPlan>> = {
      ...buildCareerPlan(profile),
    };
    delete withoutMonths.months;
    expect(careerPlanSchema.safeParse(withoutMonths).success).toBe(false);
  });

  it("rejects plans that do not contain exactly 36 months", () => {
    const plan = buildCareerPlan(profile);
    expect(careerPlanSchema.safeParse({ ...plan, months: plan.months.slice(0, 35) }).success).toBe(false);
  });
});
