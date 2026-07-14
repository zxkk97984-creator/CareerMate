import { beforeEach, describe, expect, it, vi } from "vitest";
import { createArtifactsForChat, type ChatArtifactDependencies } from "./artifact-service";
import type { NormalizedAssistantResult } from "@/lib/tbox/types";

const prismaMocks = vi.hoisted(() => ({
  userProfile: { findUnique: vi.fn() },
  careerPlan: { findFirst: vi.fn(), create: vi.fn() },
  profileUpdateCandidate: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ getPrisma: () => prismaMocks }));

function dependencies(): ChatArtifactDependencies {
  return {
    createProfileCandidate: vi.fn(async () => "candidate-1"),
    saveAgentPlan: vi.fn(async () => ({ id: "plan-1", version: 3 })),
    saveExplorationReport: vi.fn(async () => "report-1"),
    listPendingCandidateIds: vi.fn(async () => []),
  };
}

function baseResult(overrides?: Partial<NormalizedAssistantResult>): NormalizedAssistantResult {
  return {
    text: "分析完成",
    citations: [],
    warnings: [],
    ...overrides,
  };
}

const validPlan = {
  years: [{ yearIndex: 1, goal: "基础", expectedOutputs: ["项目1"] }, { yearIndex: 2, goal: "进阶", expectedOutputs: ["项目2"] }, { yearIndex: 3, goal: "专业", expectedOutputs: ["项目3"] }],
  quarters: Array.from({ length: 12 }, (_, i) => ({ quarterIndex: i + 1, goal: `阶段${i + 1}`, milestone: `里程碑${i + 1}`, evaluation: `评估${i + 1}` })),
  months: Array.from({ length: 36 }, (_, i) => ({ monthIndex: i + 1, goal: `目标${i + 1}`, learningTasks: [{ id: `t${i}`, title: `任务${i}`, type: "learn" as const, status: "not_started" as const }], practiceOutputs: [`输出${i}`], evaluationMetrics: [`指标${i}`] })),
  assumptions: ["假设1"],
  riskNotes: ["风险1"],
};

describe("createArtifactsForChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not create a plan card from user keywords without a validated agent result", async () => {
    const deps = dependencies();
    const parts = await createArtifactsForChat({
      userId: "user-1",
      conversationId: "conversation-1",
      assistantResult: baseResult({ text: "我们可以先讨论你的目标。" }),
    }, deps);
    expect(parts).toEqual([]);
    expect(deps.saveAgentPlan).not.toHaveBeenCalled();
  });

  it("creates a pending plan from a validated career_plan result", async () => {
    const deps = dependencies();
    const parts = await createArtifactsForChat({
      userId: "user-1",
      conversationId: "conversation-1",
      assistantResult: baseResult({
        text: "计划已生成",
        structured: { type: "career_plan", plan: validPlan, targetRole: "数据分析师", candidateUpdates: [] },
      }),
    }, deps);
    expect(deps.saveAgentPlan).toHaveBeenCalledWith({
      userId: "user-1",
      plan: validPlan,
      declaredTargetRole: "数据分析师",
    });
    expect(parts).toContainEqual({ type: "plan_ref", planId: "plan-1", version: 3 });
  });

  it("does not use a year milestone as the plan target role", async () => {
    const deps = dependencies();
    await createArtifactsForChat({
      userId: "user-1",
      conversationId: "conversation-1",
      assistantResult: baseResult({
        text: "计划已生成",
        structured: { type: "career_plan", plan: validPlan, candidateUpdates: [] },
      }),
    }, deps);

    expect(deps.saveAgentPlan).toHaveBeenCalledWith({
      userId: "user-1",
      plan: validPlan,
      declaredTargetRole: undefined,
    });
  });

  it("persists the confirmed profile role key when the Agent label matches", async () => {
    prismaMocks.userProfile.findUnique.mockResolvedValue({
      targetRole: "ai_product_manager",
      targetRoleLabel: "AI 产品经理",
    });
    prismaMocks.careerPlan.findFirst.mockResolvedValue({ version: 2 });
    prismaMocks.careerPlan.create.mockResolvedValue({ id: "plan-3", version: 3 });
    prismaMocks.profileUpdateCandidate.findMany.mockResolvedValue([]);

    await createArtifactsForChat({
      userId: "user-1",
      conversationId: "conversation-1",
      assistantResult: baseResult({
        text: "计划已生成",
        structured: {
          type: "career_plan",
          plan: validPlan,
          targetRole: "AI 产品经理",
          candidateUpdates: [],
        },
      }),
    });

    expect(prismaMocks.userProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { targetRole: true, targetRoleLabel: true },
    });
    expect(prismaMocks.careerPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ targetRole: "ai_product_manager" }),
    });
  });

  it("rejects a plan whose declared role conflicts with the confirmed profile", async () => {
    prismaMocks.userProfile.findUnique.mockResolvedValue({
      targetRole: "ai_product_manager",
      targetRoleLabel: "AI 产品经理",
    });
    prismaMocks.profileUpdateCandidate.findMany.mockResolvedValue([]);

    const parts = await createArtifactsForChat({
      userId: "user-1",
      conversationId: "conversation-1",
      assistantResult: baseResult({
        text: "计划已生成",
        structured: {
          type: "career_plan",
          plan: validPlan,
          targetRole: "数据分析师",
          candidateUpdates: [],
        },
      }),
    });

    expect(prismaMocks.careerPlan.create).not.toHaveBeenCalled();
    expect(parts).toContainEqual(expect.objectContaining({
      type: "error",
      code: "PLAN_TARGET_ROLE_MISMATCH",
    }));
  });

  it("creates profile candidates from candidateUpdates", async () => {
    const deps = dependencies();
    const parts = await createArtifactsForChat({
      userId: "user-1",
      conversationId: "conversation-1",
      assistantResult: baseResult({
        text: "评估完成",
        structured: {
          type: "profile_assessment",
          targetRole: "data_analyst",
          scores: { aiTooling: 60, roleFoundation: 60, dataAnalysis: 70, businessProduct: 50, communication: 55, projectPractice: 45 },
          strengths: ["分析能力强"],
          gaps: ["缺少产品经验"],
          evidence: ["完成过数据分析项目"],
          assumptions: ["假设具备SQL基础"],
          needsConfirmation: true,
          candidateUpdates: [{
            field: "weeklyAvailableHours",
            newValue: 10,
            confidence: 0.8,
            reason: "用户表达了充足投入意愿",
            evidenceExcerpt: "我每周可以投入10小时",
            impactSummary: "确认后按每周10小时调整计划强度",
            requiresConfirmation: true,
          }],
        },
      }),
    }, deps);
    expect(deps.createProfileCandidate).toHaveBeenCalled();
    expect(parts).toContainEqual({ type: "profile_candidate_ref", candidateId: "candidate-1" });
  });

  it("returns error part on SCHEMA_MISMATCH", async () => {
    const deps = dependencies();
    const parts = await createArtifactsForChat({
      userId: "user-1",
      conversationId: "conversation-1",
      assistantResult: baseResult({
        text: "Markdown 文本保留了",
        warnings: ["SCHEMA_MISMATCH"],
      }),
    }, deps);
    expect(parts).toContainEqual(expect.objectContaining({ type: "error", code: "SCHEMA_MISMATCH" }));
    expect(deps.createProfileCandidate).not.toHaveBeenCalled();
  });
});
