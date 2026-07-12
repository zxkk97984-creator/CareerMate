import { describe, expect, it, vi } from "vitest";
import { createArtifactsForChat, type ChatArtifactDependencies } from "./artifact-service";

function dependencies(): ChatArtifactDependencies {
  return {
    createProfileCandidate: vi.fn(async () => "candidate-1"),
    createPendingPlan: vi.fn(async () => ({ id: "plan-1", version: 3 })),
    researchCareer: vi.fn(async (roleName) => ({
      report: {
        roleName,
        summary: `${roleName}探索摘要`,
        responsibilities: [],
        coreCompetencies: [],
        entryPaths: [],
        marketSignals: [],
        learningSuggestions: [],
        fitAnalysis: ["AI推断：需要结合用户证据继续评估"],
        risksAndUncertainties: ["公开资料可能变化"],
        sources: [{
          title: "职业介绍",
          organization: "示例机构",
          url: "https://example.com/role",
          accessedAt: "2026-07-12",
          label: "实时联网调研" as const,
        }],
      },
      meta: {
        requestedMode: "api" as const,
        actualMode: "api" as const,
        degraded: false,
        fallbackReason: null,
        source: "tbox-api",
      },
    })),
    createExplorationReport: vi.fn(async () => "report-1"),
    listPendingCandidateIds: vi.fn(async () => []),
  };
}

describe("createArtifactsForChat", () => {
  it("把用户明确表达的每周时间保存为待确认候选", async () => {
    const deps = dependencies();
    const parts = await createArtifactsForChat({
      userId: "user-1",
      conversationId: "conversation-1",
      message: "我每周可以投入 8 小时学习",
    }, deps);

    expect(deps.createProfileCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        field: "weeklyAvailableHours",
        newValue: 8,
        sourceConversationId: "conversation-1",
      }),
    );
    expect(parts).toContainEqual({
      type: "profile_candidate_ref",
      candidateId: "candidate-1",
    });
  });

  it("计划请求创建可恢复任务并返回真实计划引用", async () => {
    const deps = dependencies();
    const parts = await createArtifactsForChat({
      userId: "user-1",
      conversationId: "conversation-1",
      message: "请帮我制定一个三个月学习计划",
    }, deps);

    expect(deps.createPendingPlan).toHaveBeenCalledWith("user-1", "conversation-1");
    expect(parts).toContainEqual({ type: "plan_ref", planId: "plan-1", version: 3 });
    expect(parts).not.toContainEqual(expect.objectContaining({ planId: "__generating__" }));
  });

  it("未知职业生成个人探索报告和来源引用", async () => {
    const deps = dependencies();
    const parts = await createArtifactsForChat({
      userId: "user-1",
      conversationId: "conversation-1",
      message: "请介绍用户研究员这个岗位",
    }, deps);

    expect(deps.researchCareer).toHaveBeenCalledWith("用户研究员", "user-1");
    expect(deps.createExplorationReport).toHaveBeenCalled();
    expect(parts).toContainEqual({ type: "exploration_report_ref", reportId: "report-1" });
    expect(parts).toContainEqual(expect.objectContaining({
      type: "citations",
      items: [expect.objectContaining({ label: "实时联网调研" })],
    }));
  });

  it("合并百宝箱插件在当前会话创建的候选并按ID去重", async () => {
    const deps = dependencies() as ChatArtifactDependencies & {
      listPendingCandidateIds: ReturnType<typeof vi.fn>;
    };
    deps.listPendingCandidateIds.mockResolvedValue(["candidate-1", "candidate-plugin"]);

    const parts = await createArtifactsForChat({
      userId: "user-1",
      conversationId: "conversation-1",
      message: "我每周可以投入 8 小时学习",
    }, deps);

    expect(deps.listPendingCandidateIds).toHaveBeenCalledWith({
      userId: "user-1",
      conversationId: "conversation-1",
    });
    expect(parts.filter((part) => part.type === "profile_candidate_ref")).toEqual([
      { type: "profile_candidate_ref", candidateId: "candidate-1" },
      { type: "profile_candidate_ref", candidateId: "candidate-plugin" },
    ]);
  });
});
