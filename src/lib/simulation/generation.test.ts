import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
  mode: "api" as "api" | "manual" | "mock",
}));

vi.mock("@/lib/env", () => ({
  getTboxConfig: () => ({ mode: mocks.mode }),
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

describe("simulation generation", () => {
  it("parses and validates a simulation_turn returned as JSON text", async () => {
    const structuredTurn = {
      type: "simulation_turn",
      scenarioKey: "cross_role_communication",
      assistantMessage: "请补充验收标准。",
      turnIndex: 1,
      shouldComplete: false,
    };
    mocks.chat.mockResolvedValue({
      data: {
        text: JSON.stringify(structuredTurn),
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
        { role: "assistant", content: "请说明目标。" },
        { role: "user", content: "目标是让用户快速发现简历问题。" },
      ],
    });

    expect(result.data.structured).toEqual(structuredTurn);
    expect(mocks.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        history: expect.arrayContaining([
          { role: "user", content: "目标是让用户快速发现简历问题。" },
        ]),
      }),
      expect.any(Object),
    );
  });

  it("rejects a simulation_turn for a different scenario", async () => {
    mocks.chat.mockResolvedValue({
      data: {
        text: "",
        structured: {
          type: "simulation_turn",
          scenarioKey: "ai_office",
          assistantMessage: "错误场景追问",
          turnIndex: 1,
          shouldComplete: false,
        },
        citations: [],
        warnings: [],
      },
      meta: apiMeta,
    });

    const result = await generateSimulationTurn({
      userId: "user-1",
      scenarioKey: "cross_role_communication",
      scenarioTitle: "跨岗位沟通",
      transcript: [{ role: "user", content: "这是我的回答。" }],
    });

    expect(result.data.structured).toBeUndefined();
    expect(result.data.warnings).toContain("SCHEMA_MISMATCH");
  });

  it("rejects a simulation_turn for a different turn index", async () => {
    mocks.chat.mockResolvedValue({
      data: {
        text: "请补充可量化指标。",
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

    const result = await generateSimulationTurn({
      userId: "user-1",
      scenarioKey: "cross_role_communication",
      scenarioTitle: "跨岗位沟通",
      transcript: [
        { role: "assistant", content: "请说明目标。" },
        { role: "user", content: "这是第一轮回答。" },
      ],
    });

    expect(result.data.structured).toBeUndefined();
    expect(result.data.text).toBe("请补充可量化指标。");
    expect(result.data.warnings).toContain("SCHEMA_MISMATCH");
  });

  it.each([
    ["a different scenario", { scenarioKey: "ai_office", turnIndex: 1 }],
    ["a different turn index", { scenarioKey: "cross_role_communication", turnIndex: 2 }],
  ])("does not expose JSON text from %s", async (_case, mismatch) => {
    const jsonTurn = {
      type: "simulation_turn",
      assistantMessage: "不可采用的追问",
      shouldComplete: false,
      ...mismatch,
    };
    mocks.chat.mockResolvedValue({
      data: {
        text: JSON.stringify(jsonTurn),
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
        { role: "assistant", content: "请说明目标。" },
        { role: "user", content: "这是第一轮回答。" },
      ],
    });

    expect(result.data.structured).toBeUndefined();
    expect(result.data.text).toBe("");
    expect(result.data.warnings).toContain("SCHEMA_MISMATCH");
  });

  it("does not expose schema-invalid simulation_turn JSON text", async () => {
    const invalidTurn = {
      type: "simulation_turn",
      scenarioKey: "cross_role_communication",
      assistantMessage: "不可采用的追问",
      turnIndex: 99,
      shouldComplete: false,
    };
    mocks.chat.mockResolvedValue({
      data: {
        text: JSON.stringify(invalidTurn),
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
        { role: "assistant", content: "请说明目标。" },
        { role: "user", content: "这是第一轮回答。" },
      ],
    });

    expect(result.data.structured).toBeUndefined();
    expect(result.data.text).toBe("");
    expect(result.data.warnings).toContain("SCHEMA_MISMATCH");
  });

  it("builds a deterministic structured report after an API runtime degradation", async () => {
    const degradedMeta = {
      requestedMode: "api" as const,
      actualMode: "mock" as const,
      degraded: true,
      fallbackReason: "timeout",
      source: "local-mock",
    };
    mocks.chat.mockResolvedValue({
      data: {
        text: "通用降级回答",
        citations: [],
        warnings: ["degraded"],
      },
      meta: degradedMeta,
    });

    const result = await generateSimulationReport({
      userId: "user-1",
      scenarioKey: "cross_role_communication",
      scenarioTitle: "跨岗位沟通",
      transcript: [
        { role: "assistant", content: "请说明目标。" },
        { role: "user", content: "目标是帮助用户发现问题，并明确负责人和验收标准。" },
      ],
      remoteConversationId: "remote-1",
    });

    expect(result.meta).toEqual(degradedMeta);
    expect(result.data.structured).toMatchObject({
      type: "simulation_report",
      scenarioKey: "cross_role_communication",
      score: expect.any(Number),
      candidateUpdates: [],
    });
    expect(result.data.conversationId).toBe("remote-1");
  });
});
