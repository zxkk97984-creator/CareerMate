import { describe, expect, it, vi } from "vitest";
import type { CareerChatDependencies } from "./server";
import { prepareCareerChat } from "./server";

// Mock env to return hybrid mode for tests that need retrieval
vi.mock("@/lib/env", () => ({
  getTboxConfig: () => ({
    mode: "api" as const,
    apiKey: "test-key",
    agentId: "test-agent",
    agentVersion: undefined,
    searchEngine: false,
    retrievalMode: "hybrid" as const,
    chatEndpoint: "http://localhost/chat",
    retrieveEndpoint: "http://localhost/retrieve",
    streamTimeoutMs: 30000,
    datasetIds: {
      roleCompetency: "ds1",
      learningResources: "ds2",
      simulationScenes: "ds3",
      ethicsRules: "ds4",
      careerTrends: "",
    },
  }),
  getPluginToken: () => "",
}));

const apiMeta = {
  requestedMode: "api" as const,
  actualMode: "api" as const,
  degraded: false,
  fallbackReason: null,
  source: "tbox-api",
};

function dependencies(overrides: Partial<CareerChatDependencies> = {}): CareerChatDependencies {
  return {
    loadProfile: vi.fn().mockResolvedValue({
      targetRole: "data_analyst",
      targetRoleLabel: "数据分析师",
      weeklyAvailableHours: 8,
      learningPreference: JSON.stringify(["项目实操"]),
      abilityScores: JSON.stringify({ dataAnalysis: 62 }),
      memoryEnabled: true,
    }),
    loadActivePlan: vi.fn().mockResolvedValue({
      targetRole: "data_analyst",
      currentMonthIndex: 1,
      months: JSON.stringify([
        {
          monthIndex: 1,
          goal: "完成 SQL 项目",
          learningTasks: [{ title: "练习窗口函数", status: "in_progress" }],
        },
      ]),
      assumptions: JSON.stringify(["每周投入 8 小时"]),
      riskNotes: JSON.stringify([]),
    }),
    loadMemories: vi.fn().mockResolvedValue([
      { content: "偏好项目实操", status: "confirmed", sensitivity: "normal" },
    ]),
    retrieve: vi.fn().mockResolvedValue({
      data: {
        items: [
          { content: "Kaggle Pandas 微课程适合入门。", source: "learning-resources-core", score: 0.9 },
        ],
      },
      meta: apiMeta,
    }),
    ...overrides,
  };
}

describe("prepareCareerChat", () => {
  it("routes a resource question and adds bounded knowledge and user context", async () => {
    const deps = dependencies();
    const result = await prepareCareerChat(
      { userId: "user-1", question: "推荐一门数据分析课程" },
      deps,
    );

    expect(deps.retrieve).toHaveBeenCalledWith({
      datasetKey: "learningResources",
      query: "数据分析师 推荐一门数据分析课程",
      limit: 3,
    });
    expect(result.enhancedQuestion).toContain("Kaggle Pandas 微课程");
    expect(result.enhancedQuestion).toContain("偏好项目实操");
    expect(result.contextMeta).toEqual({
      intent: "learningResources",
      usedProfile: true,
      usedPlan: true,
      usedMemoryCount: 1,
      knowledgeSources: ["learning-resources-core"],
      retrievalMeta: apiMeta,
    });
  });

  it("does not retrieve knowledge for a greeting", async () => {
    const deps = dependencies();
    const result = await prepareCareerChat({ userId: "user-1", question: "你好" }, deps);

    expect(deps.retrieve).not.toHaveBeenCalled();
    expect(result.contextMeta.intent).toBeNull();
    expect(result.contextMeta.knowledgeSources).toEqual([]);
  });

  it("omits memory when the profile has disabled long-term memory", async () => {
    const deps = dependencies({
      loadProfile: vi.fn().mockResolvedValue({
        targetRole: "data_analyst",
        targetRoleLabel: "数据分析师",
        memoryEnabled: false,
      }),
    });
    const result = await prepareCareerChat(
      { userId: "user-1", question: "数据分析师需要哪些能力" },
      deps,
    );

    expect(result.contextMeta.usedMemoryCount).toBe(0);
    expect(result.enhancedQuestion).not.toContain("偏好项目实操");
  });

  it("continues safely when knowledge retrieval throws", async () => {
    const deps = dependencies({ retrieve: vi.fn().mockRejectedValue(new Error("offline")) });
    const result = await prepareCareerChat(
      { userId: "user-1", question: "推荐学习资源" },
      deps,
    );

    expect(result.contextMeta).toMatchObject({
      intent: "learningResources",
      knowledgeSources: [],
      retrievalMeta: null,
    });
    expect(result.enhancedQuestion).toContain("推荐学习资源");
  });
});
