/**
 * Stateful 主聊天链路集成测试
 * 覆盖：正文零副作用、operation 执行、scope 隔离、replay、mock 元数据
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  streamProgressive: vi.fn(),
  turnBegin: vi.fn(),
  turnFinalize: vi.fn(),
  turnFail: vi.fn(),
}));

vi.mock("@/lib/tbox/streaming", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tbox/streaming")>();
  return { ...actual, streamChatWithTboxProgressive: mocks.streamProgressive };
});

vi.mock("./turn-service", () => ({
  createTurnService: () => ({
    begin: mocks.turnBegin,
    finalize: mocks.turnFinalize,
    fail: mocks.turnFail,
  }),
  TurnServiceError: class extends Error {
    constructor(msg: string, public code: string, public status: number) { super(msg); }
  },
}));

vi.mock("@/lib/env", () => ({
  getTboxConfig: () => ({
    mode: "mock" as const, apiKey: "test", agentId: "test", retrievalMode: "agent" as const,
    historyMode: "context_only" as const, contextTransport: "question_prefix" as const,
    structuredMode: "terminal" as const, reuseRemoteConversationId: false,
    chatEndpoint: "http://x", retrieveEndpoint: "http://x", streamTimeoutMs: 30000,
    searchEngine: false, probeAgentId: undefined,
    datasetIds: { roleCompetency: "", learningResources: "", simulationScenes: "", ethicsRules: "", careerTrends: "" },
  }),
  isStatefulChatTurns: () => true,
  isAgentOperationsEnabled: () => true,
  isPlanV2WriteEnabled: () => true,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    userProfile: { findUnique: vi.fn().mockResolvedValue({ userId: "u1", version: 1, memoryEnabled: true, educationStage: null, major: null, targetRole: null, targetRoleLabel: null, weeklyAvailableHours: null, learningPreference: "[]", experienceSummary: "", constraints: "[]", interestTags: "[]" }) },
    questionLedger: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    memoryItem: { findMany: vi.fn().mockResolvedValue([]) },
    careerPlan: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "plan-1", version: 1 }) },
    careerExplorationReport: { create: vi.fn().mockResolvedValue({ id: "rep-1" }) },
    profileUpdateCandidate: { create: vi.fn().mockResolvedValue({ id: "cand-1" }), findFirst: vi.fn().mockResolvedValue(null) },
    chatConversation: { findFirst: vi.fn().mockResolvedValue(null) },
  }),
}));

import { handleStreamRequest } from "./stream-service";

async function readBlocks(response: Response): Promise<string[]> {
  const r = response.body!.getReader();
  const d = new TextDecoder();
  const parts: string[] = [];
  while (true) { const { value, done } = await r.read(); if (value) parts.push(d.decode(value, { stream: !done })); if (done) break; }
  return parts.join("").split(/\n\n/).filter(Boolean).map((s) => s.trim());
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.turnBegin.mockResolvedValue({
    kind: "new",
    turn: { id: "turn-1", userMessageId: "umsg-1", assistantMessageId: "amsg-1" },
  });
  mocks.turnFinalize.mockResolvedValue({ turnId: "turn-1" });
  mocks.turnFail.mockResolvedValue(undefined);
  mocks.streamProgressive.mockImplementation(async (_: any, __: any, on: (e: any) => void) => {
    const m = { requestedMode: "mock", actualMode: "mock", degraded: false, fallbackReason: null, source: "local-mock" };
    on({ event: "message", data: { type: "delta", content: "mock reply" }, meta: m });
    on({ event: "done", data: { conversationId: null }, meta: m });
    return { data: { text: "mock reply", citations: [], warnings: [], conversationId: null }, meta: m };
  });
});

function fakeSvc() {
  return {
    getConversation: vi.fn().mockResolvedValue({ id: "c1", contextVersion: 1, summary: "", state: "{}", remoteConversationId: null }),
    getMessages: vi.fn().mockResolvedValue([]),
    createMessage: vi.fn(), updateMessage: vi.fn(), touchConversation: vi.fn(),
    updateConversationTitleFromFirstMessage: vi.fn().mockResolvedValue({}),
    listConversations: vi.fn(), createConversation: vi.fn(), updateConversation: vi.fn(), deleteConversation: vi.fn(),
  };
}

describe("stateful stream (STATEFUL_CHAT_TURNS=true)", () => {
  it("正文 JSON 零副作用——普通问题不触发 artifact", async () => {
    const response = await handleStreamRequest({
      userId: "u1", conversationId: "c1", message: "Python 是什么？",
      clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
    }, fakeSvc() as any);
    const blocks = await readBlocks(response);
    expect(blocks.some((b) => b.startsWith("event: context"))).toBe(true);
    expect(blocks.some((b) => b.startsWith("event: delta"))).toBe(true);
    expect(blocks[blocks.length - 1]).toContain("event: done");
    // 无 structured → 无 artifact
    expect(blocks.filter((b) => b.startsWith("event: artifact"))).toHaveLength(0);
  });

  it("合法 AgentResponse 触发 operation → 产生 artifact", async () => {
    mocks.streamProgressive.mockImplementationOnce(async (_: any, __: any, on: (e: any) => void) => {
      const m = { requestedMode: "mock", actualMode: "mock", degraded: false, fallbackReason: null, source: "local-mock" };
      on({ event: "message", data: { type: "delta", content: "好的" }, meta: m });
      on({ event: "done", data: { conversationId: null }, meta: m });
      return {
        data: {
          text: "好的", citations: [], warnings: [],
          structured: { schemaVersion: 1, intent: "career_advice", task: { kind: "profile_guidance", status: "collecting" }, questions: [], operations: [{ id: "op1", type: "profile_patch", patch: { weeklyAvailableHours: 10 }, sourceKind: "explicit", confidence: 0.9, evidenceExcerpt: "每周10小时", reason: "test", sensitive: false }], sourceRefs: [] },
        },
        meta: m,
      };
    });
    const response = await handleStreamRequest({
      userId: "u1", conversationId: "c1", message: "我想学习数据分析，每周10小时",
      clientRequestId: "550e8400-e29b-41d4-a716-446655440001",
    }, fakeSvc() as any);
    const blocks = await readBlocks(response);
    // operation 执行成功 → 应产生 artifact（可能是 profile_applied 或 profile_candidate_ref）
    const hasArtifact = blocks.some((b) => b.startsWith("event: artifact"));
    expect(hasArtifact).toBe(true);
    expect(blocks[blocks.length - 1]).toContain("event: done");
  });

  it("general_minimal scope 禁止 operation 写入", async () => {
    // "Python" → general_minimal
    mocks.streamProgressive.mockImplementationOnce(async (_: any, __: any, on: (e: any) => void) => {
      const m = { requestedMode: "mock", actualMode: "mock", degraded: false, fallbackReason: null, source: "local-mock" };
      on({ event: "message", data: { type: "delta", content: "Python is..." }, meta: m });
      on({ event: "done", data: { conversationId: null }, meta: m });
      return {
        data: {
          text: "Python is...", citations: [], warnings: [],
          structured: { schemaVersion: 1, intent: "general", task: { kind: "general", status: "completed" }, questions: [], operations: [{ id: "op1", type: "profile_patch", patch: { experienceSummary: "test" }, sourceKind: "inferred", confidence: 0.5, evidenceExcerpt: "t", reason: "t", sensitive: false }], sourceRefs: [] },
        },
        meta: m,
      };
    });
    const response = await handleStreamRequest({
      userId: "u1", conversationId: "c1", message: "Python 是什么",
      clientRequestId: "550e8400-e29b-41d4-a716-446655440002",
    }, fakeSvc() as any);
    const blocks = await readBlocks(response);
    expect(blocks.filter((b) => b.startsWith("event: artifact"))).toHaveLength(0);
    expect(blocks[blocks.length - 1]).toContain("event: done");
  });

  it("replay 返回完整 SSE 并标记 mock 来源", async () => {
    mocks.turnBegin.mockResolvedValueOnce({
      kind: "replay",
      turn: {
        assistantText: "已缓存的回复",
        parts: [{ type: "citations", items: [] }],
        executionMeta: { source: "replay" },
        userMessageId: "umsg-old", assistantMessageId: "amsg-old",
      },
    });
    const response = await handleStreamRequest({
      userId: "u1", conversationId: "c1", message: "你好",
      clientRequestId: "550e8400-e29b-41d4-a716-446655440003",
    }, fakeSvc() as any);
    const blocks = await readBlocks(response);
    expect(blocks.some((b) => b.startsWith("event: delta"))).toBe(true);
    expect(blocks.some((b) => b.startsWith("event: artifact"))).toBe(true);
    expect(blocks[blocks.length - 1]).toContain("event: done");
    expect(blocks[blocks.length - 1]).toContain("replay");
  });
});
