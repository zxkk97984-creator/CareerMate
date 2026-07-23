import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
  mode: "api" as "api" | "manual" | "mock",
}));

vi.mock("@/lib/env", () => ({
  getTboxConfig: () => ({
    mode: mocks.mode,
    apiKey: "",
    agentId: "test",
    retrievalMode: "agent",
    historyMode: "provider",
    contextTransport: "business_data",
    structuredMode: "terminal",
    reuseRemoteConversationId: false,
    chatEndpoint: "",
    retrieveEndpoint: "",
    streamTimeoutMs: 30000,
    searchEngine: false,
    datasetIds: {},
  }),
}));

vi.mock("@/lib/tbox/adapter", () => ({
  chatWithTbox: mocks.chat,
}));

import { generateSimulationReport, generateSimulationTurn } from "./generation";

const apiMeta = {
  requestedMode: "api" as const,
  actualMode: "api" as const,
  degraded: false,
  fallbackReason: null,
  source: "tbox-api",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mode = "api";
});

function makeArtifactText(artifact: Record<string, unknown>): string {
  return `可读回答\n<CAREERMATE_ARTIFACT>\n${JSON.stringify(artifact)}\n</CAREERMATE_ARTIFACT>`;
}

describe("simulation generation (V2 envelope protocol)", () => {
  it("从 CAREERMATE_ARTIFACT 信封中解析 simulation_turn", async () => {
    const turnArtifact = {
      schemaVersion: "1.0",
      taskType: "simulation_turn",
      status: "success",
      summary: "继续第3轮训练",
      data: {
        sessionId: "session-1",
        scenarioKey: "cross_role_communication",
        round: 3,
        nextQuestion: "你会怎样定义这次协作的验收标准？",
        isComplete: false,
      },
      evidence: [],
      sources: [],
      assumptions: [],
      warnings: [],
      requiresUserConfirmation: false,
      baseVersion: null,
      nextActions: [],
    };

    mocks.chat.mockResolvedValue({
      data: {
        text: makeArtifactText(turnArtifact),
        citations: [],
        warnings: [],
        conversationId: "remote-1",
      },
      meta: apiMeta,
    });

    const result = await generateSimulationTurn({
      userId: "user-1",
      scenarioKey: "cross_role_communication",
      scenarioTitle: "跨岗位沟通",
      transcript: [
        { role: "assistant", content: "第一轮问题？" },
        { role: "user", content: "第一轮回答。" },
        { role: "assistant", content: "第二轮问题？" },
        { role: "user", content: "第二轮回答。" },
      ],
      sessionId: "session-1",
      expectedRound: 3,
    });

    // 不应设置 structured 字段，text 应为 nextQuestion
    expect(result.data.structured).toBeUndefined();
    expect(result.data.text).toBe("你会怎样定义这次协作的验收标准？");
    expect(result.data.warnings).not.toContain("SCHEMA_MISMATCH");
  });

  it("场景不匹配时降级", async () => {
    const turnArtifact = {
      schemaVersion: "1.0",
      taskType: "simulation_turn",
      status: "success",
      summary: "继续训练",
      data: {
        scenarioKey: "ai_office",
        round: 1,
        nextQuestion: "错误场景的追问",
        isComplete: false,
      },
      evidence: [],
      sources: [],
      assumptions: [],
      warnings: [],
      requiresUserConfirmation: false,
      baseVersion: null,
      nextActions: [],
    };

    mocks.chat.mockResolvedValue({
      data: {
        text: makeArtifactText(turnArtifact),
        citations: [],
        warnings: [],
      },
      meta: apiMeta,
    });

    const result = await generateSimulationTurn({
      userId: "user-1",
      scenarioKey: "cross_role_communication",
      scenarioTitle: "跨岗位沟通",
      transcript: [{ role: "user", content: "回答。" }],
      expectedRound: 1,
    });

    expect(result.data.structured).toBeUndefined();
    expect(result.data.warnings).toContain("SCHEMA_MISMATCH");
    expect(result.meta.degraded).toBe(true);
  });

  it("重复问题被拒绝并降级", async () => {
    const turnArtifact = {
      schemaVersion: "1.0",
      taskType: "simulation_turn",
      status: "success",
      summary: "继续训练",
      data: {
        scenarioKey: "cross_role_communication",
        round: 2,
        nextQuestion: "你会怎样定义协作验收标准",
        isComplete: false,
      },
      evidence: [],
      sources: [],
      assumptions: [],
      warnings: [],
      requiresUserConfirmation: false,
      baseVersion: null,
      nextActions: [],
    };

    mocks.chat.mockResolvedValue({
      data: {
        text: makeArtifactText(turnArtifact),
        citations: [],
        warnings: [],
      },
      meta: apiMeta,
    });

    const result = await generateSimulationTurn({
      userId: "user-1",
      scenarioKey: "cross_role_communication",
      scenarioTitle: "跨岗位沟通",
      transcript: [
        { role: "assistant", content: "你会怎样定义协作验收标准？" },
        { role: "user", content: "回答。" },
      ],
      expectedRound: 2,
    });

    expect(result.data.structured).toBeUndefined();
    expect(result.data.warnings).toContain("REPEATED_QUESTION");
    expect(result.meta.degraded).toBe(true);
  });

  it("无信封时返回纯文本", async () => {
    mocks.chat.mockResolvedValue({
      data: {
        text: "普通回答，不含任何信封",
        citations: [],
        warnings: [],
      },
      meta: apiMeta,
    });

    const result = await generateSimulationTurn({
      userId: "user-1",
      scenarioKey: "cross_role_communication",
      scenarioTitle: "跨岗位沟通",
      transcript: [{ role: "user", content: "回答。" }],
    });

    expect(result.data.structured).toBeUndefined();
    expect(result.data.text).toBe("普通回答，不含任何信封");
  });

  it("从信封中解析 simulation_report", async () => {
    const reportArtifact = {
      schemaVersion: "1.0",
      taskType: "simulation_report",
      status: "success",
      summary: "训练完成报告",
      data: {
        scenarioKey: "cross_role_communication",
        score: 85,
        strengths: ["沟通清晰"],
        improvements: ["需要更多数据支撑"],
        evidence: [],
        abilityImpact: { communication: 5 },
        candidateUpdates: [],
      },
      evidence: [],
      sources: [],
      assumptions: [],
      warnings: [],
      requiresUserConfirmation: false,
      baseVersion: null,
      nextActions: [],
    };

    mocks.chat.mockResolvedValue({
      data: {
        text: makeArtifactText(reportArtifact),
        citations: [],
        warnings: [],
        conversationId: "remote-1",
      },
      meta: apiMeta,
    });

    const result = await generateSimulationReport({
      userId: "user-1",
      scenarioKey: "cross_role_communication",
      scenarioTitle: "跨岗位沟通",
      transcript: [
        { role: "assistant", content: "问题？" },
        { role: "user", content: "回答。" },
      ],
      sessionId: "session-1",
    });

    expect(result.data.structured).toBeDefined();
    const report = result.data.structured as Record<string, unknown> | undefined;
    expect(report?.type).toBe("simulation_report");
    expect(report?.scenarioKey).toBe("cross_role_communication");
    expect(report?.score).toBe(85);
  });
});
