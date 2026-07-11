import { describe, expect, it } from "vitest";
import {
  buildCareerChatPrompt,
  classifyCareerChatIntent,
  createSafeCareerContext,
} from "./context";

describe("career chat intent routing", () => {
  it.each([
    ["数据分析师需要哪些能力？", "roleCompetency"],
    ["推荐一门 SQL 课程和作品集项目", "learningResources"],
    ["陪我练一次跨岗位沟通", "simulationScenes"],
    ["如何删除长期记忆并导出数据？", "ethicsRules"],
    ["你好", null],
  ] as const)("routes %s", (question, expected) => {
    expect(classifyCareerChatIntent(question)).toBe(expected);
  });
});

describe("safe career chat context", () => {
  it("keeps only allowlisted profile, plan, and confirmed normal memory fields", () => {
    const context = createSafeCareerContext({
      profile: {
        educationStage: "junior",
        major: "统计学",
        targetRole: "data_analyst",
        targetRoleLabel: "数据分析师",
        weeklyAvailableHours: 8,
        learningPreference: ["项目实操"],
        abilityScores: { dataAnalysis: 62 },
        memoryEnabled: true,
        passwordHash: "must-not-leak",
        tokenHash: "must-not-leak",
      },
      plan: {
        targetRole: "data_analyst",
        currentMonthIndex: 2,
        currentMonth: {
          goal: "完成 SQL 项目",
          learningTasks: [
            { title: "练习窗口函数", status: "in_progress" },
            { title: "完成入门课程", status: "done" },
          ],
        },
        assumptions: ["每周投入 8 小时"],
        riskNotes: ["注意控制任务密度"],
        rawPrivatePlan: "must-not-leak",
      },
      memories: [
        { content: "偏好项目实操", status: "confirmed", sensitivity: "normal" },
        { content: "敏感经历", status: "confirmed", sensitivity: "sensitive" },
        { content: "未确认偏好", status: "pending", sensitivity: "normal" },
        { content: "第一条", status: "confirmed", sensitivity: "normal" },
        { content: "第二条", status: "confirmed", sensitivity: "normal" },
        { content: "第三条", status: "confirmed", sensitivity: "normal" },
        { content: "第四条", status: "confirmed", sensitivity: "normal" },
        { content: "第五条会被截断", status: "confirmed", sensitivity: "normal" },
      ],
    });

    expect(context).toEqual({
      profile: {
        educationStage: "junior",
        major: "统计学",
        targetRole: "data_analyst",
        targetRoleLabel: "数据分析师",
        weeklyAvailableHours: 8,
        learningPreference: ["项目实操"],
        abilityScores: { dataAnalysis: 62 },
      },
      currentPlan: {
        targetRole: "data_analyst",
        currentMonthIndex: 2,
        goal: "完成 SQL 项目",
        pendingTasks: ["练习窗口函数"],
        assumptions: ["每周投入 8 小时"],
        riskNotes: ["注意控制任务密度"],
      },
      memories: ["偏好项目实操", "第一条", "第二条", "第三条", "第四条"],
    });
    expect(JSON.stringify(context)).not.toMatch(/must-not-leak|敏感经历|未确认偏好/);
  });

  it("omits memories when long-term memory is disabled", () => {
    const context = createSafeCareerContext({
      profile: { memoryEnabled: false, targetRole: "ai_product_manager" },
      memories: [{ content: "不可使用", status: "confirmed", sensitivity: "normal" }],
    });

    expect(context.memories).toEqual([]);
  });
});

describe("career chat prompt", () => {
  it("uses bounded evidence and ends with the exact user question", () => {
    const question = "我现在最应该先做什么？";
    const prompt = buildCareerChatPrompt({
      question,
      context: createSafeCareerContext({
        profile: { targetRoleLabel: "AI 产品经理", weeklyAvailableHours: 6 },
      }),
      knowledgeItems: [
        { content: "A".repeat(1_200), source: "role-ai-product-manager", score: 0.9 },
      ],
    });

    expect(prompt).toContain("直接结论");
    expect(prompt).toContain("role-ai-product-manager");
    expect(prompt.length).toBeLessThanOrEqual(8_000);
    expect(prompt.endsWith(question)).toBe(true);
  });
});
