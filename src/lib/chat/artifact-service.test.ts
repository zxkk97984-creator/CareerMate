import { describe, expect, it, vi } from "vitest";
import { createArtifactsForChat, type ChatArtifactDependencies } from "./artifact-service";
import type { NormalizedAssistantResult } from "@/lib/tbox/types";

function dependencies(): ChatArtifactDependencies {
  return {
    createProfileCandidate: vi.fn(async () => "candidate-1"),
    createPendingPlan: vi.fn(async () => ({ id: "plan-1", version: 3 })),
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

describe("createArtifactsForChat", () => {
  it("does not create a plan card from user keywords without a validated agent result", async () => {
    const deps = dependencies();
    const parts = await createArtifactsForChat({
      userId: "user-1",
      conversationId: "conversation-1",
      assistantResult: baseResult({ text: "我们可以先讨论你的目标。" }),
    }, deps);
    expect(parts).toEqual([]);
    expect(deps.createPendingPlan).not.toHaveBeenCalled();
  });

  it("creates a pending plan from a validated career_plan result", async () => {
    const deps = dependencies();
    const parts = await createArtifactsForChat({
      userId: "user-1",
      conversationId: "conversation-1",
      assistantResult: baseResult({
        text: "计划已生成",
        structured: { type: "career_plan", plan: {}, candidateUpdates: [] },
      }),
    }, deps);
    expect(deps.createPendingPlan).toHaveBeenCalledWith("user-1", "conversation-1");
    expect(parts).toContainEqual({ type: "plan_ref", planId: "plan-1", version: 3 });
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
