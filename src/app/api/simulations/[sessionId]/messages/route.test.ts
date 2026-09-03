import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  generateTurn: vi.fn(),
  requireCurrentUser: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/simulation/generation", () => ({
  generateSimulationTurn: mocks.generateTurn,
}));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    simulationSession: {
      findFirst: mocks.findFirst,
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
    },
  }),
}));

import { POST } from "./route";

const updatedAt = new Date("2026-07-14T00:00:00.000Z");
const session = {
  id: "session-1",
  userId: "user-1",
  scenarioKey: "cross_role_communication",
  scenarioTitle: "跨岗位沟通",
  transcript: JSON.stringify([{ role: "assistant", content: "请先说明目标。" }]),
  score: null,
  feedback: "{}",
  status: "active",
  turnCount: 0,
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

function request(message: string) {
  return new Request("http://localhost/api/simulations/session-1/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
  mocks.findFirst.mockResolvedValue(session);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.findUnique.mockImplementation(async () => {
    const update = mocks.updateMany.mock.calls.at(-1)?.[0]?.data;
    return {
      ...session,
      ...update,
      updatedAt: new Date("2026-07-14T00:00:01.000Z"),
    };
  });
});

describe("POST /api/simulations/[sessionId]/messages", () => {
  it("ignores a structured turn for another scenario and keeps trusted text", async () => {
    mocks.generateTurn.mockResolvedValue({
      data: {
        text: "请补充可量化的验收标准。",
        structured: {
          type: "simulation_turn",
          scenarioKey: "ai_office",
          assistantMessage: "错误场景追问",
          turnIndex: 1,
          shouldComplete: false,
        },
        citations: [],
        warnings: [],
        conversationId: "remote-2",
      },
      meta: apiMeta,
    });

    const response = await POST(request("目标是帮助用户快速发现简历问题。"), {
      params: Promise.resolve({ sessionId: "session-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.assistantMessage).toBe("请补充可量化的验收标准。");
    expect(mocks.generateTurn).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-1",
      expectedRound: 1,
      remoteConversationId: "remote-1",
      transcript: [
        { role: "assistant", content: "请先说明目标。" },
        { role: "user", content: "目标是帮助用户快速发现简历问题。" },
      ],
    }));
    expect(mocks.updateMany.mock.calls[0][0].data.remoteConversationId).toBe("remote-2");
  });

  it("ignores a structured turn for another turn index and keeps trusted text", async () => {
    mocks.generateTurn.mockResolvedValue({
      data: {
        text: "请补充可量化的验收标准。",
        structured: {
          type: "simulation_turn",
          scenarioKey: "cross_role_communication",
          assistantMessage: "错误轮次追问",
          turnIndex: 2,
          shouldComplete: false,
        },
        citations: [],
        warnings: [],
      },
      meta: apiMeta,
    });

    const response = await POST(request("目标是帮助用户快速发现简历问题。"), {
      params: Promise.resolve({ sessionId: "session-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.assistantMessage).toBe("请补充可量化的验收标准。");
  });

  it("keeps trusted Agent text when only the separate structured field mismatches", async () => {
    mocks.generateTurn.mockResolvedValue({
      data: {
        text: "请补充可量化的验收标准。",
        structured: undefined,
        citations: [],
        warnings: ["SCHEMA_MISMATCH"],
        conversationId: "remote-2",
      },
      meta: apiMeta,
    });

    const response = await POST(request("目标是帮助用户快速发现简历问题。"), {
      params: Promise.resolve({ sessionId: "session-1" }),
    });
    const payload = await response.json();
    const update = mocks.updateMany.mock.calls[0][0].data;
    const storedTranscript = JSON.parse(update.transcript);

    expect(response.status).toBe(200);
    expect(payload.data.assistantMessage).toBe("请补充可量化的验收标准。");
    expect(storedTranscript.at(-1).meta).toEqual(apiMeta);
    expect(update).toMatchObject({ requestedMode: "api", actualMode: "api" });
    expect(payload.meta).toEqual(apiMeta);
  });

  it("uses the deterministic scenario prompt whenever the agent call is degraded", async () => {
    mocks.generateTurn.mockResolvedValue({
      data: {
        text: "通用降级回答",
        structured: {
          type: "simulation_turn",
          scenarioKey: "cross_role_communication",
          assistantMessage: "降级结构化追问",
          turnIndex: 1,
          shouldComplete: false,
        },
        citations: [],
        warnings: ["degraded"],
      },
      meta: {
        requestedMode: "api",
        actualMode: "mock",
        degraded: true,
        fallbackReason: "timeout",
        source: "local-mock",
      },
    });

    const response = await POST(request("目标是帮助用户快速发现简历问题。"), {
      params: Promise.resolve({ sessionId: "session-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.assistantMessage).toBe("请补充优先级、验收标准与回退方案。");
  });

  it("stores the deterministic prompt instead of rejected structured JSON text", async () => {
    const invalidTurnJson = JSON.stringify({
      type: "simulation_turn",
      scenarioKey: "cross_role_communication",
      assistantMessage: "不应进入 transcript",
      turnIndex: 99,
      shouldComplete: false,
    });
    mocks.generateTurn.mockResolvedValue({
      data: {
        text: invalidTurnJson,
        structured: undefined,
        citations: [],
        warnings: ["SCHEMA_MISMATCH"],
      },
      meta: apiMeta,
    });

    const response = await POST(request("目标是帮助用户快速发现简历问题。"), {
      params: Promise.resolve({ sessionId: "session-1" }),
    });
    const payload = await response.json();
    const storedTranscript = JSON.parse(mocks.updateMany.mock.calls[0][0].data.transcript);

    expect(response.status).toBe(200);
    expect(payload.data.assistantMessage).toBe("请补充优先级、验收标准与回退方案。");
    expect(storedTranscript.at(-1).content).toBe("请补充优先级、验收标准与回退方案。");
    expect(storedTranscript.at(-1).content).not.toContain("simulation_turn");
    expect(storedTranscript.at(-1).meta).toEqual({
      requestedMode: "api",
      actualMode: "mock",
      degraded: true,
      fallbackReason: "validation_error",
      source: "local-simulation-fallback",
    });
    expect(mocks.updateMany.mock.calls[0][0].data).toMatchObject({
      requestedMode: "api",
      actualMode: "mock",
    });
    expect(payload.meta).toEqual(storedTranscript.at(-1).meta);
  });
});
