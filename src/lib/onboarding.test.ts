import { describe, expect, it } from "vitest";
import {
  calculateOnboardingCompleteness,
  canCompleteOnboarding,
  extractOnboardingDraft,
  extractOnboardingDraftForTurn,
  mergeOnboardingDraft,
  nextOnboardingQuestion,
  onboardingDraftSchema,
  profileUpdateCandidateFromExtraction,
  rebuildOnboardingDraft,
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

  it("uses a bare short answer for the currently requested major", () => {
    const previous: OnboardingDraft = { educationStage: "sophomore" };

    expect(extractOnboardingDraftForTurn("数据科学与大数据技术", previous)).toEqual({
      major: "数据科学与大数据技术",
    });
  });

  it.each(["不知道", "没有", "AI产品经理", "每周 5 小时"])(
    "does not treat %s as a bare major",
    (message) => {
      const previous: OnboardingDraft = { educationStage: "sophomore" };

      expect(extractOnboardingDraftForTurn(message, previous)).not.toHaveProperty("major");
    },
  );

  it("replays the reported onboarding sequence into a complete partial draft", () => {
    const transcript = [
      { role: "user" as const, content: "我是本科大二的学生" },
      { role: "assistant" as const, content: "你目前主修什么专业？" },
      { role: "user" as const, content: "数据科学与大数据技术" },
      { role: "assistant" as const, content: "你目前有比较明确的目标岗位吗？" },
      { role: "user" as const, content: "AI产品经理" },
    ];

    expect(rebuildOnboardingDraft(transcript, {})).toMatchObject({
      educationStage: "sophomore",
      major: "数据科学与大数据技术",
      targetRole: "ai_product_manager",
      targetRoleLabel: "AI 产品经理",
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

  // ── 任意非种子职业（不依赖白名单）──
  it.each([
    ["我想做精算师", "精算师"],
    ["我想当宠物殡葬师", "宠物殡葬师"],
    ["我想成为海洋生物声学研究员", "海洋生物声学研究员"],
    ["目标是工业设计师", "工业设计师"],
    ["想做心理咨询师", "心理咨询师"],
    // 裸角色名（后缀识别）
    ["精算师", "精算师"],
    ["宠物殡葬师", "宠物殡葬师"],
  ])("extracts any career without whitelist: %s", (message, expectedLabel) => {
    const draft = extractOnboardingDraft(message);
    expect(draft.targetRole).toBeDefined();
    expect(draft.targetRole).toMatch(/^custom_/);
    expect(draft.targetRoleLabel).toBe(expectedLabel);
  });

  // ── 否定输入不误写 ──
  it.each([
    "还没想好",
    "不知道",
    "没想好",
    "不确定",
    "随便",
  ])("negative input %s does not extract targetRole", (message) => {
    const draft = extractOnboardingDraft(message);
    expect(draft.targetRole).toBeUndefined();
  });

  // ── onboarding 追问 targetRole 时接受裸回答 ──
  it("accepts bare role answer during onboarding targetRole ask", () => {
    const previous: OnboardingDraft = { educationStage: "sophomore", major: "计算机科学" };
    // missing targetRole → 短文本被视为角色名
    const draft = extractOnboardingDraftForTurn("宠物殡葬师", previous);
    expect(draft.targetRoleLabel).toBe("宠物殡葬师");
    // 英文缩写裸回答
    const draft2 = extractOnboardingDraftForTurn("UX", previous);
    expect(draft2.targetRoleLabel).toBe("UX");
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
