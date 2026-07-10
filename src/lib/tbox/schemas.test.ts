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
  onboardingCompleted: true,
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

  it("rejects duplicate or out-of-order timeline indices", () => {
    const duplicate = buildCareerPlan(profile);
    duplicate.years[1]!.yearIndex = 1;
    duplicate.quarters[4]!.quarterIndex = 4;
    duplicate.months[8]!.monthIndex = 8;
    expect(careerPlanSchema.safeParse(duplicate).success).toBe(false);
  });

  it("rejects unsupported task types and statuses", () => {
    const plan = buildCareerPlan(profile);
    const invalid = {
      ...plan,
      months: plan.months.map((month, index) =>
        index === 0
          ? {
              ...month,
              learningTasks: [
                { ...month.learningTasks[0], type: "bogus", status: "bogus" },
              ],
            }
          : month,
      ),
    };
    expect(careerPlanSchema.safeParse(invalid).success).toBe(false);
  });

  it("accepts every documented task type, delayed status, and optional dueWeek", () => {
    const plan = buildCareerPlan(profile) as any;
    plan.months[0].learningTasks = [
      { id: "learn", title: "学习", type: "learn", status: "not_started" },
      { id: "practice", title: "实践", type: "practice", status: "in_progress", dueWeek: 2 },
      { id: "review", title: "复盘", type: "review", status: "delayed", dueWeek: 3 },
      { id: "simulation", title: "模拟", type: "simulation", status: "done", dueWeek: 4 },
    ];
    expect(careerPlanSchema.safeParse(plan).success).toBe(true);
  });
});
