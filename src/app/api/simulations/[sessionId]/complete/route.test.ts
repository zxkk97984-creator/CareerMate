import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  candidateCreate: vi.fn(),
  findFirst: vi.fn(),
  generateReport: vi.fn(),
  logCreate: vi.fn(),
  requireCurrentUser: vi.fn(),
  sessionUpdate: vi.fn(),
  sessionUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/simulation/generation", () => ({
  generateSimulationReport: mocks.generateReport,
}));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    simulationSession: { findFirst: mocks.findFirst },
    $transaction: mocks.transaction,
  }),
}));

import { POST } from "./route";

const updatedAt = new Date("2026-07-14T00:00:00.000Z");
const session = {
  id: "session-1",
  userId: "user-1",
  scenarioKey: "cross_role_communication",
  scenarioTitle: "跨岗位沟通",
  transcript: JSON.stringify([
    { role: "assistant", content: "请说明目标。" },
    { role: "user", content: "目标是帮助用户发现问题。" },
    { role: "assistant", content: "请补充验收标准。" },
    { role: "user", content: "验收标准是输出稳定、可解释。" },
    { role: "assistant", content: "请说明异常处理。" },
    { role: "user", content: "失败时保留输入并提示重试。" },
  ]),
  score: null,
  feedback: "{}",
  status: "active",
  turnCount: 3,
  requestedMode: "api",
  actualMode: "api",
  remoteConversationId: "remote-1",
  candidateId: null,
  createdAt: updatedAt,
  updatedAt,
};

const apiMeta = {
  requestedMode: "api" as const,
  actualMode: "api" as const,
  degraded: false,
  fallbackReason: null,
  source: "tbox-api",
};

function report(overrides: Record<string, unknown> = {}) {
  return {
    type: "simulation_report",
    scenarioKey: "cross_role_communication",
    score: 84,
    strengths: ["目标清晰"],
    improvements: ["补充量化指标"],
    evidence: ["用户明确说明了验收标准"],
    abilityImpact: { communication: 3 },
    candidateUpdates: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue({
    id: "user-1",
    profile: { abilityScores: JSON.stringify({ communication: 60 }) },
  });
  mocks.findFirst.mockResolvedValue(session);
  mocks.sessionUpdateMany.mockResolvedValue({ count: 1 });
  mocks.sessionUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...session,
    ...data,
    updatedAt: new Date("2026-07-14T00:00:01.000Z"),
  }));
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
    simulationSession: {
      updateMany: mocks.sessionUpdateMany,
      update: mocks.sessionUpdate,
    },
    profileUpdateCandidate: { create: mocks.candidateCreate },
    progressLog: { create: mocks.logCreate },
  }));
});

describe("POST /api/simulations/[sessionId]/complete", () => {
  it("keeps the session retryable when the API report has no valid structure", async () => {
    mocks.generateReport.mockResolvedValue({
      data: {
        text: "这是一段 Markdown 报告。",
        citations: [],
        warnings: ["SCHEMA_MISMATCH"],
        conversationId: "remote-2",
      },
      meta: apiMeta,
    });

    const response = await POST(new Request("http://localhost/api/simulations/session-1/complete", {
      method: "POST",
    }), { params: Promise.resolve({ sessionId: "session-1" }) });
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error.code).toBe("SIMULATION_REPORT_INVALID");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.generateReport).toHaveBeenCalledWith(expect.objectContaining({
      remoteConversationId: "remote-1",
    }));
  });

  it("rejects a validly shaped report for another scenario", async () => {
    mocks.generateReport.mockResolvedValue({
      data: {
        text: "",
        structured: report({ scenarioKey: "ai_office" }),
        citations: [],
        warnings: [],
      },
      meta: apiMeta,
    });

    const response = await POST(new Request("http://localhost/api/simulations/session-1/complete", {
      method: "POST",
    }), { params: Promise.resolve({ sessionId: "session-1" }) });
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error.code).toBe("SIMULATION_REPORT_SCENARIO_MISMATCH");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("persists the remote conversation id returned with a valid report", async () => {
    mocks.generateReport.mockResolvedValue({
      data: {
        text: "",
        structured: report(),
        citations: [],
        warnings: [],
        conversationId: "remote-2",
      },
      meta: apiMeta,
    });

    const response = await POST(new Request("http://localhost/api/simulations/session-1/complete", {
      method: "POST",
    }), { params: Promise.resolve({ sessionId: "session-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.sessionUpdate.mock.calls[0][0].data.remoteConversationId).toBe("remote-2");
  });

  it("does not claim that a candidate was generated when the report has no candidate update", async () => {
    mocks.generateReport.mockResolvedValue({
      data: {
        text: "",
        structured: report(),
        citations: [],
        warnings: [],
      },
      meta: apiMeta,
    });

    await POST(new Request("http://localhost/api/simulations/session-1/complete", {
      method: "POST",
    }), { params: Promise.resolve({ sessionId: "session-1" }) });

    expect(mocks.logCreate.mock.calls[0][0].data.summary).toContain("未生成画像更新候选");
  });

  it("creates and reports a candidate only for a validated non-degraded update", async () => {
    mocks.candidateCreate.mockResolvedValue({ id: "candidate-1" });
    mocks.generateReport.mockResolvedValue({
      data: {
        text: "",
        structured: report({
          candidateUpdates: [{
            field: "abilityScores.communication",
            newValue: 84,
            confidence: 0.8,
            reason: "训练证据支持",
            evidenceExcerpt: "明确说明验收标准",
            impactSummary: "确认后更新沟通能力分",
            requiresConfirmation: true,
          }],
        }),
        citations: [],
        warnings: [],
      },
      meta: apiMeta,
    });

    await POST(new Request("http://localhost/api/simulations/session-1/complete", {
      method: "POST",
    }), { params: Promise.resolve({ sessionId: "session-1" }) });

    expect(mocks.candidateCreate).toHaveBeenCalledTimes(1);
    expect(mocks.logCreate.mock.calls[0][0].data.summary).toContain("已生成画像更新候选");
  });

  it("persists a marked deterministic score without a candidate after degradation", async () => {
    const degradedMeta = {
      requestedMode: "api" as const,
      actualMode: "mock" as const,
      degraded: true,
      fallbackReason: "timeout",
      source: "local-mock",
    };
    mocks.generateReport.mockResolvedValue({
      data: {
        text: "",
        structured: report(),
        citations: [],
        warnings: ["degraded"],
      },
      meta: degradedMeta,
    });

    await POST(new Request("http://localhost/api/simulations/session-1/complete", {
      method: "POST",
    }), { params: Promise.resolve({ sessionId: "session-1" }) });

    expect(mocks.sessionUpdate.mock.calls[0][0].data).toMatchObject({ score: 84, actualMode: "mock" });
    expect(mocks.candidateCreate).not.toHaveBeenCalled();
    expect(mocks.logCreate.mock.calls[0][0].data.summary).toContain("来源：降级评分");
  });
});
