import { describe, expect, it } from "vitest";
import {
  calculateOnboardingCompleteness,
  canCompleteOnboarding,
  extractOnboardingDraft,
  mergeOnboardingDraft,
  nextOnboardingQuestion,
  onboardingDraftSchema,
  profileUpdateCandidateFromExtraction,
  type OnboardingDraft,
} from "./onboarding";

describe("onboarding domain", () => {
  it("validates weekly hours and trims meaningful draft values", () => {
    expect(
      onboardingDraftSchema.parse({
        educationStage: " junior ",
        weeklyAvailableHours: 40,
        learningPreference: ["project", "project", " video "],
        constraints: [" 时间有限 "],
      }),
    ).toEqual({
      educationStage: "junior",
      weeklyAvailableHours: 40,
      learningPreference: ["project", "video"],
      constraints: ["时间有限"],
    });
    expect(() => onboardingDraftSchema.parse({ weeklyAvailableHours: 0 })).toThrow();
    expect(() => onboardingDraftSchema.parse({ weeklyAvailableHours: 41 })).toThrow();
  });

  it("extracts supported facts deterministically from one Chinese message", () => {
    const extracted = extractOnboardingDraft(
      "我是大三统计学专业，目标是数据分析师，每周能投入 8 小时，喜欢看视频和做项目。做过校园活动数据看板，但时间有限。",
    );

    expect(extracted).toEqual({
      educationStage: "junior",
      major: "统计学",
      targetRole: "data_analyst",
      targetRoleLabel: "数据分析师",
      weeklyAvailableHours: 8,
      learningPreference: ["video", "project"],
      experienceSummary: "做过校园活动数据看板",
      constraints: ["时间有限"],
    });
  });

  it.each([
    ["我读大一", "freshman"],
    ["现在大二", "sophomore"],
    ["本科大四", "senior"],
    ["我在读研究生", "postgraduate"],
    ["已经工作两年", "worker"],
    ["工作后想转行", "career_switcher"],
  ])("maps education text %s to %s", (message, educationStage) => {
    expect(extractOnboardingDraft(message).educationStage).toBe(educationStage);
  });

  it.each([
    ["想做 AI 产品经理", "ai_product_manager", "AI 产品经理"],
    ["目标 data_analyst", "data_analyst", "数据分析师"],
    ["考虑 AIGC 内容运营", "aigc_operator", "AIGC 内容运营"],
  ])("maps supported target role %s", (message, targetRole, targetRoleLabel) => {
    expect(extractOnboardingDraft(message)).toMatchObject({ targetRole, targetRoleLabel });
  });

  it("preserves prior values and merges array facts without duplicates", () => {
    const previous: OnboardingDraft = {
      educationStage: "junior",
      major: "统计学",
      targetRole: "data_analyst",
      targetRoleLabel: "数据分析师",
      learningPreference: ["video"],
      constraints: ["预算有限"],
    };

    expect(
      mergeOnboardingDraft(previous, {
        weeklyAvailableHours: 6,
        learningPreference: ["video", "project"],
        constraints: ["时间有限", "预算有限"],
      }),
    ).toEqual({
      ...previous,
      weeklyAvailableHours: 6,
      learningPreference: ["video", "project"],
      constraints: ["预算有限", "时间有限"],
    });
  });

  it("computes completeness over exactly seven meaningful information groups", () => {
    const complete: OnboardingDraft = {
      educationStage: "junior",
      major: "统计学",
      targetRole: "data_analyst",
      targetRoleLabel: "数据分析师",
      weeklyAvailableHours: 8,
      learningPreference: ["project"],
      experienceSummary: "做过课程数据项目",
      constraints: ["暂无特殊限制"],
    };

    expect(calculateOnboardingCompleteness({})).toBe(0);
    expect(calculateOnboardingCompleteness(complete)).toBe(1);
    expect(calculateOnboardingCompleteness({ ...complete, constraints: [] })).toBeCloseTo(6 / 7, 5);
    expect(calculateOnboardingCompleteness({ ...complete, targetRoleLabel: "" })).toBeCloseTo(6 / 7, 5);
  });

  it("enables confirmation at exactly 80 percent completeness", () => {
    expect(canCompleteOnboarding(0.7999)).toBe(false);
    expect(canCompleteOnboarding(0.8)).toBe(true);
  });

  it("asks the first missing group and recognizes that no constraint is meaningful", () => {
    expect(nextOnboardingQuestion({})).toContain("学习或工作阶段");
    expect(
      nextOnboardingQuestion({
        educationStage: "junior",
        major: "统计学",
        targetRole: "data_analyst",
        targetRoleLabel: "数据分析师",
        weeklyAvailableHours: 8,
        learningPreference: ["project"],
        experienceSummary: "做过课程项目",
      }),
    ).toContain("限制");
    expect(extractOnboardingDraft("目前没有特殊限制").constraints).toEqual(["暂无特殊限制"]);
  });

  it("creates a single field-level candidate from newly extracted profile facts", () => {
    expect(
      profileUpdateCandidateFromExtraction(
        { targetRole: "ai_product_manager", targetRoleLabel: "AI 产品经理" },
        { targetRole: "data_analyst", targetRoleLabel: "数据分析师" },
      ),
    ).toMatchObject({
      field: "targetRole",
      oldValue: "ai_product_manager",
      newValue: "data_analyst",
      requiresConfirmation: true,
    });
  });
});
