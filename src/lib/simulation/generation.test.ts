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

import { generateSimulationReport, generateSimulationScenario, generateSimulationTurn } from "./generation";

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
  it("generates a custom scenario from the V2 scenario workflow envelope", async () => {
    mocks.chat.mockResolvedValue({
      data: {
        text: makeArtifactText({
          schemaVersion: "1.0",
          taskType: "simulation_scenario",
          status: "success",
          summary: "自定义场景",
          data: {
            sourceType: "custom",
            sourceRef: null,
            scenarioSnapshot: {
              key: "custom",
              title: "项目延期沟通",
              difficulty: "L2",
              durationMinutes: 8,
              skills: ["communication"],
              role: "项目协调人",
              counterpart: "跨部门负责人",
              objective: "同步风险和下一步",
              brief: "关键依赖延期，需要异步同步并给出决策点。",
              openingMessage: "请先说明事实、风险和你的下一步。",
              prompts: ["请补充判断依据。"],
              scoringDimensions: ["事实清晰", "推进能力"],
            },
          },
          evidence: [],
          sources: [],
          assumptions: [],
          warnings: [],
          requiresUserConfirmation: false,
          baseVersion: null,
          nextActions: [],
        }),
        citations: [],
        warnings: [],
      },
      meta: apiMeta,
    });

    const result = await generateSimulationScenario({
      userId: "user-1",
      request: "项目延期时练习异步沟通",
      custom: {
        description: "关键依赖延期，需要异步同步并给出决策点。",
        role: "项目协调人",
        counterpart: "跨部门负责人",
        objective: "同步风险和下一步",
        difficulty: "L2",
      },
    });

    expect(result.data.scenarioSnapshot.title).toBe("项目延期沟通");
    expect(result.meta.degraded).toBe(false);
  });

  it("normalizes repairable scenario JSON and object arrays without falling back", async () => {
    const raw = '{"taskType":"simulation_scenario","status":"success","summary":"生成"测试"场景","scenarioSnapshot":{"key":"custom","title":"需求沟通","difficulty":"L2","durationMinutes":8,"skills":[{"name":"沟通"}],"role":"AI 产品经理","counterpart":"业务负责人","objective":"对齐优先级","brief":"范围临时扩大。","openingMessage":"请先说明优先级。","prompts":[{"hint":"先澄清业务价值"}],"scoringDimensions":[{"dimension":"需求表达"}]},"evidence":[],"sources":[],"assumptions":[],"warnings":[],"requiresUserConfirmation":false,"baseVersion":null,"nextActions":[]}';
    mocks.chat.mockResolvedValue({
      data: {
        text: `可读回答\n<CAREERMATE_ARTIFACT>${raw}</CAREERMATE_ARTIFACT>`,
        citations: [],
        warnings: [],
      },
      meta: apiMeta,
    });

    const result = await generateSimulationScenario({
      userId: "user-1",
      request: "需求范围临时扩大",
      custom: {
        description: "需求范围临时扩大。",
        role: "AI 产品经理",
        counterpart: "业务负责人",
        objective: "对齐优先级",
        difficulty: "L2",
      },
    });

    expect(result.meta.degraded).toBe(false);
    expect(result.data.scenarioSnapshot.prompts).toEqual(["先澄清业务价值"]);
    expect(result.data.scenarioSnapshot.scoringDimensions).toEqual(["需求表达"]);
  });

  it("falls back to the local template and marks the scenario generation as degraded", async () => {
    mocks.chat.mockResolvedValue({
      data: { text: "not an envelope", citations: [], warnings: [] },
      meta: apiMeta,
    });

    const result = await generateSimulationScenario({
      userId: "user-1",
      request: "项目延期时练习异步沟通",
      custom: {
        description: "关键依赖延期，需要异步同步并给出决策点。",
        role: "项目协调人",
        counterpart: "跨部门负责人",
        objective: "同步风险和下一步",
        difficulty: "L2",
      },
    });

    expect(result.meta.degraded).toBe(true);
    expect(result.data.scenarioSnapshot.brief).toContain("关键依赖延期");
  });

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
      scenarioSnapshot: {
        key: "cross_role_communication",
        title: "跨岗位沟通",
        difficulty: "L1",
        durationMinutes: 6,
        skills: ["communication"],
        role: "产品同学",
        counterpart: "技术负责人",
        objective: "对齐目标与验收标准",
        brief: "自定义情境唯一标记-BRIEF-42",
        openingMessage: "请先说明目标。",
        prompts: ["请补充验收标准。"],
        scoringDimensions: ["需求表达", "风险意识"],
      },
    });

    // 不应设置 structured 字段，text 应为 nextQuestion
    expect(result.data.structured).toBeUndefined();
    expect(result.data.text).toBe("你会怎样定义这次协作的验收标准？");
    expect(result.data.warnings).not.toContain("SCHEMA_MISMATCH");
    expect(mocks.chat.mock.calls[0][0].question).toContain("自定义情境唯一标记-BRIEF-42");
  });

  it("场景不匹配时降级", async () => {
    const turnArtifact = {
      schemaVersion: "1.0",
      taskType: "simulation_turn",
      status: "success",
      summary: "继续训练",
      data: {
        sessionId: "s1",
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
        sessionId: "session-1",
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
        sessionId: "session-1",
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

  it("拒绝 status=error 的 simulation_report 信封并使用降级报告", async () => {
    const reportArtifact = {
      schemaVersion: "1.0",
      taskType: "simulation_report",
      status: "error",
      summary: "工具失败",
      data: {
        sessionId: "session-1",
        scenarioKey: "cross_role_communication",
        score: 99,
        strengths: ["不应采信"],
        improvements: [],
        evidence: [],
        abilityImpact: {},
        candidateUpdates: [],
      },
      evidence: [],
      sources: [],
      assumptions: [],
      warnings: ["上游失败"],
      requiresUserConfirmation: false,
      baseVersion: null,
      nextActions: [],
    };

    mocks.chat.mockResolvedValue({
      data: {
        text: makeArtifactText(reportArtifact),
        citations: [],
        warnings: [],
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

    expect(result.meta.degraded).toBe(true);
    expect((result.data.structured as { score: number }).score).not.toBe(99);
  });

  it("平台无 structured 字段时，从正文 JSON 代码块解析 simulation_report", async () => {
    const reportJson = {
      type: "simulation_report",
      scenarioKey: "cross_role_communication",
      score: 88,
      strengths: ["逻辑清晰"],
      improvements: ["补充量化指标"],
      evidence: ["用户回答中提到了漏斗拆解"],
      abilityImpact: { communication: 3, dataAnalysis: 4 },
      candidateUpdates: [],
    };

    mocks.chat.mockResolvedValue({
      data: {
        text: "以下是报告：\n```json\n" + JSON.stringify(reportJson) + "\n```",
        citations: [],
        warnings: [],
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
    });

    expect(result.meta.degraded).toBe(false);
    expect(result.data.structured).toBeDefined();
    const report = result.data.structured as { score: number; strengths: string[] } | undefined;
    expect(report?.score).toBe(88);
    expect(report?.strengths).toContain("逻辑清晰");
    expect(result.data.warnings).toContain("REPORT_EXTRACTED_FROM_TEXT");
  });

  it("纯 JSON 正文且缺少 type 时自动补全为 simulation_report", async () => {
    const reportJson = {
      scenarioKey: "cross_role_communication",
      score: 76,
      strengths: ["表达清楚"],
      improvements: ["结论先行"],
      evidence: [],
      abilityImpact: { communication: 2 },
    };

    mocks.chat.mockResolvedValue({
      data: {
        text: JSON.stringify(reportJson),
        citations: [],
        warnings: [],
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
    });

    expect(result.meta.degraded).toBe(false);
    const report = result.data.structured as { type: string; score: number } | undefined;
    expect(report?.type).toBe("simulation_report");
    expect(report?.score).toBe(76);
  });
});
