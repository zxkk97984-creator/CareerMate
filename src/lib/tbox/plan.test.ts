import { describe, expect, it, vi } from "vitest";
import type { ProfileDto } from "@/lib/types";
import { buildCareerPlan } from "@/lib/career";
import { generatePlanWithTbox } from "./plan";
import type { TboxConfig } from "./types";

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
  version: 1,
  introStatus: "not_started",
  updatedAt: "2026-07-10T00:00:00.000Z",
};

const config: TboxConfig = {
  mode: "manual",
  apiKey: "",
  agentId: "",
  searchEngine: false,
  retrievalMode: "agent",
  historyMode: "provider",
  contextTransport: "business_data",
  structuredMode: "terminal",
  reuseRemoteConversationId: false,
  chatEndpoint: "https://o.tbox.cn/openapi/v1/chat/create",
  retrieveEndpoint: "https://api.tbox.cn/api/datasets/retrieve",
  streamTimeoutMs: 90_000,
  probeAgentId: undefined,
  datasetIds: {
    roleCompetency: "",
    learningResources: "",
    simulationScenes: "",
    ethicsRules: "",
    careerTrends: "",
  },
};

describe("career plan orchestration", () => {
  it("uses a valid manual database sample with honest source metadata", async () => {
    const result = await generatePlanWithTbox(profile, {
      config,
      loadManualSample: vi.fn(async () => ({ payload: JSON.stringify(buildCareerPlan(profile)) })),
    });

    expect(result.data.months).toHaveLength(36);
    expect(result.meta).toEqual({
      requestedMode: "manual",
      actualMode: "manual",
      degraded: false,
      fallbackReason: null,
      source: "manual-ai-sample",
    });
  });

  it.each(["ai_product_manager", "data_analyst", "aigc_operator"])(
    "provides a validated code manual fixture for %s when the database sample is absent",
    async (targetRole) => {
      const result = await generatePlanWithTbox(
        { ...profile, targetRole, targetRoleLabel: targetRole },
        { config, loadManualSample: vi.fn(async () => null) },
      );

      expect(result.data.months).toHaveLength(36);
      expect(result.meta.actualMode).toBe("manual");
      expect(result.meta.source).toBe("manual-fixture");
    },
  );
});
