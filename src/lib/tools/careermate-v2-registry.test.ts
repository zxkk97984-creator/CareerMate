import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentArtifactV1 } from "@/lib/agentic-v2/contracts";
import {
  CAREERMATE_V2_TOOL_NAMES,
  CareerMateV2McpError,
  createCareerMateV2ToolRegistry,
} from "./careermate-v2-registry";

const claims = {
  schemaVersion: "1" as const,
  sub: "user-1",
  sid: "conversation-1",
  scopes: [
    "profile:read",
    "history:read",
    "resources:read",
    "candidates:create",
    "simulation:append",
  ] as const,
  iat: 1_000,
  exp: 1_300,
  jti: "request-1",
};

const artifact: AgentArtifactV1 = {
  schemaVersion: "1.0",
  taskType: "career_plan",
  status: "pending_confirmation",
  summary: "待确认的规划",
  data: { stages: [] },
  evidence: [],
  sources: [],
  assumptions: [],
  warnings: [],
  requiresUserConfirmation: true,
  baseVersion: 3,
  nextActions: [],
};

function setup() {
  const db = {
    userProfile: {
      findUnique: vi.fn().mockResolvedValue({
        userId: "user-1",
        version: 4,
        educationStage: "大三",
        major: "计算机科学",
        targetRole: "ai_product_manager",
        targetRoleLabel: "AI 产品经理",
        weeklyAvailableHours: 8,
        learningPreference: "[\"项目制\"]",
        experienceSummary: "做过课程项目",
        interestTags: "[\"AI\"]",
        constraints: "[\"每周8小时\"]",
        abilityScores: "{\"dataAnalysis\":60}",
        memoryEnabled: true,
        onboardingCompleted: true,
        updatedAt: new Date("2026-07-20T00:00:00.000Z"),
      }),
    },
    abilityEvidence: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "evidence-1",
          abilityKey: "dataAnalysis",
          summary: "完成分析项目",
          sourceType: "project",
          sourceRef: "project-1",
          confidence: 0.9,
          status: "confirmed",
          observedAt: new Date("2026-07-19T00:00:00.000Z"),
        },
      ]),
    },
    careerPlan: {
      findFirst: vi.fn().mockResolvedValue({
        id: "plan-active",
        targetRole: "ai_product_manager",
        targetRoleLabel: "AI 产品经理",
        version: 3,
        status: "active",
        schemaVersion: 2,
        content: "{\"stages\":[]}",
        years: "[]",
        quarters: "[]",
        months: "[]",
        currentMonthIndex: 2,
        assumptions: "[\"每周8小时\"]",
        riskNotes: "[]",
        generationMeta: "{\"source\":\"tbox\"}",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        updatedAt: new Date("2026-07-20T00:00:00.000Z"),
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    progressLog: { findMany: vi.fn().mockResolvedValue([]) },
    simulationSession: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({
        id: "simulation-1",
        userId: "user-1",
        scenarioKey: "cross_role_communication",
        scenarioTitle: "跨岗位沟通",
        transcript: "[{\"role\":\"assistant\",\"content\":\"开始\"}]",
        score: null,
        feedback: "{}",
        status: "active",
        turnCount: 0,
        requestedMode: "api",
        actualMode: "api",
        remoteConversationId: null,
        candidateId: null,
        createdAt: new Date("2026-07-20T00:00:00.000Z"),
        updatedAt: new Date("2026-07-20T00:00:00.000Z"),
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue({
        id: "simulation-1",
        userId: "user-1",
        scenarioKey: "cross_role_communication",
        scenarioTitle: "跨岗位沟通",
        transcript: "[]",
        score: null,
        feedback: "{}",
        status: "active",
        turnCount: 1,
        requestedMode: "api",
        actualMode: "api",
        remoteConversationId: null,
        candidateId: null,
        createdAt: new Date("2026-07-20T00:00:00.000Z"),
        updatedAt: new Date("2026-07-20T00:00:00.000Z"),
      }),
    },
    roleTemplate: { findMany: vi.fn().mockResolvedValue([]) },
    resourceItem: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const verifyToken = vi.fn().mockReturnValue(claims);
  const candidateService = {
    createCandidate: vi.fn().mockResolvedValue({
      id: "candidate-1",
      status: "pending",
      candidateType: "career_plan",
    }),
  };
  const registry = createCareerMateV2ToolRegistry({
    db: db as never,
    verifyToken,
    candidateService,
  });
  return { candidateService, db, registry, verifyToken };
}

beforeEach(() => vi.clearAllMocks());

describe("CareerMate business MCP V2 registry", () => {
  it("publishes exactly seven planned tools whose schemas contain context_token and never userId", () => {
    const { registry } = setup();
    const listed = registry.listForMcp();

    expect(listed.map((tool) => tool.name)).toEqual(CAREERMATE_V2_TOOL_NAMES);
    expect(CAREERMATE_V2_TOOL_NAMES).toHaveLength(7);
    for (const tool of listed) {
      const schema = tool.inputSchema as {
        required?: string[];
        properties?: Record<string, unknown>;
        additionalProperties?: boolean;
      };
      expect(schema.required).toContain("context_token");
      expect(schema.properties).toHaveProperty("context_token");
      expect(schema.properties).not.toHaveProperty("userId");
      expect(schema.additionalProperties).toBe(false);
    }
  });

  it.each([
    ["invalid signature", new Error("Invalid context token"), "CONTEXT_TOKEN_INVALID"],
    ["expired token", new Error("Context token expired"), "CONTEXT_TOKEN_EXPIRED"],
  ])("maps %s before any business query", async (_label, tokenError, code) => {
    const { db, registry, verifyToken } = setup();
    verifyToken.mockImplementation(() => { throw tokenError; });

    await expect(registry.call("profile.read", { context_token: "bad" }))
      .rejects.toMatchObject({ code, status: 401 });
    expect(db.userProfile.findUnique).not.toHaveBeenCalled();
  });

  it("verifies the token before checking scope and querying", async () => {
    const { db, registry, verifyToken } = setup();
    verifyToken.mockReturnValue({ ...claims, scopes: ["history:read"] });

    await expect(registry.call("profile.read", { context_token: "signed" }))
      .rejects.toMatchObject({ code: "INSUFFICIENT_SCOPE", status: 403 });
    expect(verifyToken).toHaveBeenCalledWith("signed");
    expect(db.userProfile.findUnique).not.toHaveBeenCalled();
  });

  it("rejects model-supplied userId as an invalid parameter", async () => {
    const { registry } = setup();
    await expect(registry.call("profile.read", {
      context_token: "signed",
      userId: "other-user",
    })).rejects.toMatchObject({ code: "INVALID_PARAMS", status: 400 });
  });

  it("reads and parses only the bound user's confirmed profile evidence", async () => {
    const { db, registry } = setup();
    const result = await registry.call("profile.read", { context_token: "signed" });

    expect(db.userProfile.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1" },
    }));
    expect(db.abilityEvidence.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1", status: "confirmed" },
    }));
    expect(result).toMatchObject({
      version: 4,
      profile: {
        learningPreference: ["项目制"],
        interestTags: ["AI"],
        constraints: ["每周8小时"],
        abilityScores: { dataAnalysis: 60 },
      },
      abilityEvidence: [{ id: "evidence-1", status: "confirmed" }],
    });
  });

  it("returns parsed current plan, bounded history, progress and simulation summaries", async () => {
    const { db, registry } = setup();
    const result = await registry.call("growth_history.read", {
      context_token: "signed",
      limit: 12,
    });

    expect(db.careerPlan.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1", status: "active" },
    }));
    expect(db.careerPlan.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1" },
      take: 12,
    }));
    expect(db.progressLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1" },
      take: 12,
    }));
    expect(db.simulationSession.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1" },
      take: 12,
    }));
    expect(result).toMatchObject({
      currentPlan: {
        content: { stages: [] },
        assumptions: ["每周8小时"],
        generationMeta: { source: "tbox" },
      },
    });
  });

  it("filters official career templates and parses their JSON fields", async () => {
    const { db, registry } = setup();
    db.roleTemplate.findMany.mockResolvedValue([{
      id: "role-1",
      roleKey: "data_analyst",
      roleName: "数据分析师",
      category: "数据",
      targetAudience: "[]",
      entryRequirements: "[\"SQL\"]",
      coreWork: "[]",
      abilityWeights: "{\"dataAnalysis\":30}",
      threeYearPath: "[]",
      monthlyTemplates: "[]",
      practiceProjects: "[]",
      recommendedResources: "[]",
      simulationScenarios: "[]",
      evaluationRules: "[]",
      sources: "[]",
      aliases: "[\"DA\"]",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    }]);

    const result = await registry.call("career_templates.query", {
      context_token: "signed",
      roleKey: "data_analyst",
      query: "数据",
      limit: 3,
    });

    expect(db.roleTemplate.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ roleKey: "data_analyst" }),
      take: 3,
    }));
    expect(result).toEqual([expect.objectContaining({
      entryRequirements: ["SQL"],
      abilityWeights: { dataAnalysis: 30 },
      aliases: ["DA"],
    })]);
  });

  it("filters learning resources by role, ability, stage, hours and query", async () => {
    const { db, registry } = setup();
    await registry.call("learning_resources.query", {
      context_token: "signed",
      roleKey: "data_analyst",
      abilityKey: "dataAnalysis",
      stage: "beginner",
      maxHours: 8,
      query: "SQL",
      limit: 5,
    });

    expect(db.resourceItem.findMany).toHaveBeenCalledWith({
      where: {
        roleKey: "data_analyst",
        abilityKey: "dataAnalysis",
        stage: "beginner",
        estimatedHours: { lte: 8 },
        OR: [
          { title: { contains: "SQL" } },
          { description: { contains: "SQL" } },
          { source: { contains: "SQL" } },
        ],
      },
      take: 5,
      orderBy: { title: "asc" },
    });
  });

  it("loads only a simulation owned by the token user and parses transcript and feedback", async () => {
    const { db, registry } = setup();
    const result = await registry.call("simulation_state.read", {
      context_token: "signed",
      sessionId: "simulation-1",
    });

    expect(db.simulationSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "simulation-1", userId: "user-1" },
    }));
    expect(result).toMatchObject({
      id: "simulation-1",
      transcript: [{ role: "assistant", content: "开始" }],
      feedback: {},
    });
  });

  it("derives candidate identity and both source IDs from verified token claims", async () => {
    const { candidateService, registry } = setup();
    await registry.call("candidate.create", {
      context_token: "signed",
      candidateType: "career_plan",
      artifact,
    });

    expect(candidateService.createCandidate).toHaveBeenCalledTimes(1);
    const input = candidateService.createCandidate.mock.calls[0]![0];
    expect(input).toMatchObject({
      userId: "user-1",
      candidateType: "career_plan",
      context: {
        sessionId: "conversation-1",
        conversationId: "conversation-1",
      },
    });
    expect(input.context.idempotencyKey).toMatch(/^[a-f0-9]{64}$/);
    const canonical = JSON.stringify(artifact, Object.keys(artifact).sort());
    expect(input.context.idempotencyKey).not.toBe(
      createHash("sha256").update(canonical).digest("hex"),
    );
  });

  it("derives the same candidate idempotency key for canonically equal artifacts", async () => {
    const { candidateService, registry } = setup();
    const reordered = Object.fromEntries(Object.entries(artifact).reverse());

    await registry.call("candidate.create", {
      context_token: "signed",
      candidateType: "career_plan",
      artifact,
    });
    await registry.call("candidate.create", {
      context_token: "signed",
      candidateType: "career_plan",
      artifact: reordered,
    });

    expect(candidateService.createCandidate.mock.calls[0]![0].context.idempotencyKey)
      .toBe(candidateService.createCandidate.mock.calls[1]![0].context.idempotencyKey);
  });

  it("maps an invalid token session conversation to a safe V2 error", async () => {
    const { candidateService, registry } = setup();
    candidateService.createCandidate.mockRejectedValue(Object.assign(new Error("Source conversation missing"), {
      code: "CONVERSATION_NOT_FOUND",
      status: 404,
    }));

    await expect(registry.call("candidate.create", {
      context_token: "signed",
      candidateType: "career_plan",
      artifact,
    })).rejects.toMatchObject({ code: "CONTEXT_SESSION_NOT_FOUND", status: 403 });
  });

  it("atomically appends one actual user/assistant turn for the bound owner", async () => {
    const { db, registry } = setup();
    const result = await registry.call("simulation_turn.append", {
      context_token: "signed",
      sessionId: "simulation-1",
      expectedTurnCount: 0,
      userMessage: "我会先澄清目标和验收标准",
      assistantMessage: "请继续说明关键依赖。",
      executionMeta: { source: "tbox-v2" },
      remoteConversationId: "remote-1",
    });

    expect(db.simulationSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "simulation-1", userId: "user-1" },
    }));
    expect(db.simulationSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: "simulation-1",
        userId: "user-1",
        status: "active",
        turnCount: 0,
      },
      data: {
        transcript: JSON.stringify([
          { role: "assistant", content: "开始" },
          { role: "user", content: "我会先澄清目标和验收标准" },
          { role: "assistant", content: "请继续说明关键依赖。", meta: { source: "tbox-v2" } },
        ]),
        turnCount: 1,
        remoteConversationId: "remote-1",
      },
    });
    expect(result).toMatchObject({ id: "simulation-1", turnCount: 1 });
  });

  it.each([
    [{ userId: "user-2" }, "SIMULATION_NOT_FOUND", 404],
    [{ status: "completed" }, "SIMULATION_NOT_ACTIVE", 409],
    [{ turnCount: 2 }, "SIMULATION_TURN_CONFLICT", 409],
    [{ turnCount: 6 }, "SIMULATION_MAX_TURNS", 409],
  ])("blocks invalid simulation mutation state %o", async (override, code, status) => {
    const { db, registry } = setup();
    if ("userId" in override && override.userId === "user-2") {
      db.simulationSession.findFirst.mockResolvedValue(null);
    }
    else db.simulationSession.findFirst.mockResolvedValue({
      ...(await db.simulationSession.findFirst()),
      ...override,
    });

    await expect(registry.call("simulation_turn.append", {
      context_token: "signed",
      sessionId: "simulation-1",
      expectedTurnCount: 0,
      userMessage: "用户实际回答",
      assistantMessage: "下一道问题",
    })).rejects.toMatchObject({ code, status });
    expect(db.simulationSession.updateMany).not.toHaveBeenCalled();
  });

  it("returns a 409 conflict when the optimistic update loses", async () => {
    const { db, registry } = setup();
    db.simulationSession.updateMany.mockResolvedValue({ count: 0 });

    await expect(registry.call("simulation_turn.append", {
      context_token: "signed",
      sessionId: "simulation-1",
      expectedTurnCount: 0,
      userMessage: "用户实际回答",
      assistantMessage: "下一道问题",
    })).rejects.toMatchObject({ code: "SIMULATION_TURN_CONFLICT", status: 409 });
  });

  it("does not expose any formal profile, plan or progress writes", () => {
    const { registry } = setup();
    expect(registry.listForMcp().map((tool) => tool.name)).not.toEqual(expect.arrayContaining([
      "profile.update",
      "career_plan.publish",
      "progress.update",
      "user.delete_all",
    ]));
  });

  it("uses an explicit V2 error for unknown tools", async () => {
    const { registry } = setup();
    await expect(registry.call("unknown", { context_token: "signed" }))
      .rejects.toBeInstanceOf(CareerMateV2McpError);
  });
});
