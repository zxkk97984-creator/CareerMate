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
  agenticV2Enabled: false,
  retrievalMode: "agent" as "agent" | "hybrid",
  retrieveWithTbox: vi.fn(),
  snapshotShouldThrow: false,
}));

vi.mock("@/lib/tbox/streaming", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tbox/streaming")>();
  return { ...actual, streamChatWithTboxProgressive: mocks.streamProgressive };
});

vi.mock("@/lib/tbox/retrieval", () => ({
  retrieveWithTbox: mocks.retrieveWithTbox,
}));

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
    mode: "mock" as const, apiKey: "test", agentId: "test", retrievalMode: mocks.retrievalMode,
    historyMode: "context_only" as const, contextTransport: "question_prefix" as const,
    structuredMode: "terminal" as const, reuseRemoteConversationId: false,
    chatEndpoint: "http://x", retrieveEndpoint: "http://x", streamTimeoutMs: 30000,
    searchEngine: false, probeAgentId: undefined,
    datasetIds: { roleCompetency: "", learningResources: "", simulationScenes: "", ethicsRules: "", careerTrends: "" },
  }),
  isStatefulChatTurns: () => true,
  isAgenticV2Enabled: () => mocks.agenticV2Enabled,
  isAgentOperationsEnabled: () => true,
  isPlanV2WriteEnabled: () => true,
}));

vi.mock("./agentic-v2-snapshot", () => ({
  loadAgenticV2Snapshot: vi.fn().mockImplementation(async () => {
    if (mocks.snapshotShouldThrow) throw new Error("SNAPSHOT_TOO_LARGE");
    return {
      profileSnapshot: { available: true, version: 1, data: {} },
      historySnapshot: { available: true, through: "2026-07-23T00:00:00.000Z", data: { activePlan: null, recentProgress: [], recentSimulations: [], confirmedMemories: [], conversationSummary: "", contextVersion: 1 } },
      simulationState: null,
    };
  }),
  AgenticV2SnapshotError: class extends Error {
    constructor(msg: string, public code: string) { super(msg); }
  },
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    userProfile: { findUnique: vi.fn().mockResolvedValue({ userId: "u1", version: 1, memoryEnabled: true, educationStage: null, major: null, targetRole: null, targetRoleLabel: null, weeklyAvailableHours: null, learningPreference: "[]", experienceSummary: "", constraints: "[]", interestTags: "[]", abilityScores: "{}", onboardingCompleted: false }) },
    questionLedger: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    memoryItem: { findMany: vi.fn().mockResolvedValue([]) },
    careerPlan: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "plan-1", version: 1 }) },
    careerExplorationReport: { create: vi.fn().mockResolvedValue({ id: "rep-1" }) },
    profileUpdateCandidate: { create: vi.fn().mockResolvedValue({ id: "cand-1" }), findFirst: vi.fn().mockResolvedValue(null) },
    chatConversation: { findUnique: vi.fn().mockResolvedValue(null), findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    abilityEvidence: { findMany: vi.fn().mockResolvedValue([]) },
    progressLog: { findMany: vi.fn().mockResolvedValue([]) },
    simulationSession: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    operationExecution: { create: vi.fn().mockResolvedValue({}), findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn() },
    agentArtifactCandidate: { upsert: vi.fn().mockResolvedValue({ id: "cand-1", status: "pending", candidateType: "career_plan", artifact: "{}", baseVersion: 3, sourceSessionId: "session-1", sourceConversationId: "c1" }) },
    $transaction: vi.fn().mockImplementation((fn: any) => fn({
      chatConversation: { findFirst: vi.fn().mockResolvedValue({ id: "c1" }) },
      agentArtifactCandidate: {
        upsert: vi.fn().mockImplementation((args: any) => {
          const artifact = args.create?.artifact ?? "{}";
          return Promise.resolve({
            id: "cand-1",
            status: "pending",
            candidateType: args.create?.candidateType ?? "career_plan",
            artifact,
            baseVersion: args.create?.baseVersion ?? null,
            sourceSessionId: args.create?.sourceSessionId ?? "session-1",
            sourceConversationId: args.create?.sourceConversationId ?? "c1",
          });
        }),
      },
    })),
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
  mocks.agenticV2Enabled = false;
  mocks.retrievalMode = "agent";
  mocks.retrieveWithTbox.mockReset();
  mocks.turnBegin.mockResolvedValue({
    kind: "new",
    turn: { id: "turn-1", userMessageId: "umsg-1", assistantMessageId: "amsg-1" },
  });
  mocks.turnFinalize.mockResolvedValue({ turnId: "turn-1" });
  mocks.turnFail.mockResolvedValue(undefined);
  mocks.streamProgressive.mockImplementation(async (input: any, __: any, on: (e: any) => void) => {
    const m = { requestedMode: "mock", actualMode: "mock", degraded: false, fallbackReason: null, source: "local-mock" };
    on({ event: "message", data: { type: "delta", content: "mock reply" }, meta: m });
    on({ event: "done", data: { conversationId: input.conversationId ?? null }, meta: m });
    return { data: { text: "mock reply", citations: [], warnings: [], conversationId: input.conversationId ?? null }, meta: m };
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
  it("Agentic V2 sends only scoped business_data, disables built-in search, and reuses the bound remote conversation", async () => {
    mocks.agenticV2Enabled = true;
    const service = fakeSvc();
    service.getConversation.mockResolvedValue({
      id: "c1",
      contextVersion: 1,
      summary: "private conversation summary",
      state: "{}",
      remoteConversationId: "remote-existing",
      remoteAgentId: "test",
      remoteAgentVersion: null,
    });

    const response = await handleStreamRequest({
      userId: "u1",
      conversationId: "c1",
      message: "根据我的情况调整规划",
      clientRequestId: "550e8400-e29b-41d4-a716-446655440099",
      interaction: { surface: "career_path", action: "regenerate_plan" },
    }, service as any);
    await readBlocks(response);

    const input = mocks.streamProgressive.mock.calls[0][0];
    expect(input).toMatchObject({
      question: "根据我的情况调整规划",
      conversationId: "remote-existing",
      searchPolicy: "off",
      context: expect.objectContaining({
        schemaVersion: "1",
        profileSnapshot: expect.objectContaining({ available: true }),
        historySnapshot: expect.objectContaining({ available: true }),
        permissions: {
          candidateCreationAllowed: true,
          officialWritesAllowed: false,
        },
      }),
    });
    expect(input.history).toBeUndefined();
    const serialized = JSON.stringify(input.context);
    expect(serialized).not.toContain("private conversation summary");
    expect(serialized).not.toContain("careermate_context_token");
    expect(Object.keys(input.context).sort()).toEqual([
      "historySnapshot",
      "interaction",
      "permissions",
      "profileSnapshot",
      "schemaVersion",
      "simulationState",
    ]);
    expect(mocks.turnFinalize).toHaveBeenCalledWith(expect.objectContaining({
      remoteBinding: { agentId: "test", agentVersion: undefined },
    }));
  });

  it("Agentic V2 does not reuse a remote conversation created by another agent", async () => {
    mocks.agenticV2Enabled = true;
    const service = fakeSvc();
    service.getConversation.mockResolvedValue({
      id: "c1",
      contextVersion: 1,
      summary: "",
      state: "{}",
      remoteConversationId: "remote-v1",
      remoteAgentId: "old-agent",
      remoteAgentVersion: "1.0",
    });

    const response = await handleStreamRequest({
      userId: "u1",
      conversationId: "c1",
      message: "继续",
      clientRequestId: "550e8400-e29b-41d4-a716-446655440097",
    }, service as any);
    await readBlocks(response);

    expect(mocks.streamProgressive.mock.calls[0][0].conversationId).toBeUndefined();
  });

  it("Agentic V2 never executes legacy direct-write operations", async () => {
    mocks.agenticV2Enabled = true;
    mocks.streamProgressive.mockImplementationOnce(async (_: any, __: any, on: (e: any) => void) => {
      const meta = { requestedMode: "mock", actualMode: "mock", degraded: false, fallbackReason: null, source: "local-mock" };
      on({ event: "message", data: { type: "delta", content: "候选建议" }, meta });
      on({ event: "done", data: { conversationId: "remote-1" }, meta });
      return {
        data: {
          text: "候选建议",
          citations: [],
          warnings: [],
          conversationId: "remote-1",
          structured: {
            schemaVersion: 1,
            intent: "career_advice",
            questions: [],
            operations: [{
              id: "legacy-write",
              type: "profile_patch",
              patch: { weeklyAvailableHours: 99 },
              sourceKind: "explicit",
              confidence: 1,
              evidenceExcerpt: "legacy",
              reason: "must not run",
              sensitive: false,
            }],
            sourceRefs: [],
          },
        },
        meta,
      };
    });

    const response = await handleStreamRequest({
      userId: "u1",
      conversationId: "c1",
      message: "调整画像",
      clientRequestId: "550e8400-e29b-41d4-a716-446655440098",
    }, fakeSvc() as any);
    const blocks = await readBlocks(response);

    const artifacts = blocks.filter((block) => block.startsWith("event: artifact")).join("\n");
    expect(artifacts).not.toContain("profile_applied");
    expect(artifacts).not.toContain("profile_candidate_ref");
    expect(artifacts).not.toContain("OPERATION_FAILED");
    expect(blocks[blocks.length - 1]).toContain("event: done");
  });


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
  it("hybrid mode pre-retrieves knowledge base and injects KB-first strategy", async () => {
    mocks.retrievalMode = "hybrid";
    mocks.retrieveWithTbox.mockResolvedValue({
      data: {
        items: [
          { content: "产品经理岗位能力模板：业务理解、数据分析、沟通协作。", source: "role-ai-product-manager", score: 0.9 },
        ],
      },
      meta: { requestedMode: "api", actualMode: "api", degraded: false, fallbackReason: null, source: "tbox-api" },
    });
    const response = await handleStreamRequest({
      userId: "u1", conversationId: "c1", message: "产品经理岗位需要哪些核心能力",
      clientRequestId: "550e8400-e29b-41d4-a716-446655440099",
    }, fakeSvc() as any);
    const blocks = await readBlocks(response);

    const input = mocks.streamProgressive.mock.calls[0][0];
    expect(input.question).toContain("role-ai-product-manager");
    expect(input.question).toContain("回答策略");
    expect(input.question).toContain("已核验职业库");
    const contextBlock = blocks.find((b) => b.startsWith("event: context"))!;
    expect(contextBlock).toContain("role-ai-product-manager");
    mocks.retrievalMode = "agent";
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

  it("Agentic V2 从真实文本流中解析 CAREERMATE_ARTIFACT 信封并创建候选", async () => {
    mocks.agenticV2Enabled = true;
    const artifactBlock = `<CAREERMATE_ARTIFACT>${JSON.stringify({
      schemaVersion: "1.0",
      taskType: "career_plan",
      status: "pending_confirmation",
      summary: "三年计划候选",
      data: {
        plan: {
          schemaVersion: 2,
          title: "数据分析师三年计划",
          targetRole: { key: "data_analyst", label: "数据分析师" },
          summary: "分析岗三年计划",
          horizon: { value: 3, unit: "year" },
          phases: [{ id: "p1", title: "基础期", objective: "入门", duration: { value: 6, unit: "month" }, skills: [], actions: [{ id: "a1", title: "学SQL", description: "基础", type: "learning", status: "not_started", resources: [] }], outputs: [], evaluationCriteria: [], risks: [] }],
          immediateActions: [],
          assumptions: [],
          riskNotes: [],
          evidenceRefs: [],
        },
      },
      evidence: [],
      sources: [],
      assumptions: [],
      warnings: [],
      requiresUserConfirmation: true,
      baseVersion: 3,
      nextActions: [],
    })}</CAREERMATE_ARTIFACT>`;

    mocks.streamProgressive.mockImplementationOnce(async (_: any, __: any, on: (e: any) => void) => {
      const meta = { requestedMode: "mock", actualMode: "mock", degraded: false, fallbackReason: null, source: "local-mock" };
      on({ event: "message", data: { type: "delta", content: `这是可读计划摘要。\n${artifactBlock}` }, meta });
      on({ event: "done", data: { conversationId: "remote-1" }, meta });
      return {
        data: {
          text: `这是可读计划摘要。\n${artifactBlock}`,
          structured: undefined,
          citations: [],
          warnings: [],
          toolCalls: [],
        },
        meta,
      };
    });

    const response = await handleStreamRequest({
      userId: "u1",
      conversationId: "c1",
      message: "帮我生成三年规划",
      clientRequestId: "req-env-1",
    }, fakeSvc() as any);
    const blocks = await readBlocks(response);

    // 持久化的助手内容为剥离信封后的文本
    expect(mocks.turnFinalize).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantText: "这是可读计划摘要。",
      }),
    );

    // 候选引用部件已持久化并发送
    const finalizeCall = mocks.turnFinalize.mock.calls[0][0];
    const parts = finalizeCall.parts as Array<{ type: string }>;
    const candidateRef = parts.find((p) => p.type === "agent_artifact_candidate_ref");
    expect(candidateRef).toBeDefined();

    // 通过 artifact 事件发送
    const artifactBlocks = blocks.filter((b) => b.startsWith("event: artifact"));
    expect(artifactBlocks.some((b) => b.includes("agent_artifact_candidate_ref"))).toBe(true);

    expect(blocks[blocks.length - 1]).toContain("event: done");
  });

  it("Agentic V2 对无标签 JSON 不创建候选", async () => {
    mocks.agenticV2Enabled = true;
    mocks.streamProgressive.mockImplementationOnce(async (_: any, __: any, on: (e: any) => void) => {
      const meta = { requestedMode: "mock", actualMode: "mock", degraded: false, fallbackReason: null, source: "local-mock" };
      on({ event: "message", data: { type: "delta", content: "普通回答" }, meta });
      on({ event: "done", data: { conversationId: null }, meta });
      return {
        data: {
          text: "普通回答",
          structured: undefined,
          citations: [],
          warnings: [],
          toolCalls: [],
        },
        meta,
      };
    });

    const response = await handleStreamRequest({
      userId: "u1",
      conversationId: "c1",
      message: "你好",
      clientRequestId: "req-no-env",
    }, fakeSvc() as any);
    await readBlocks(response);

    const finalizeCall = mocks.turnFinalize.mock.calls[0][0];
    const parts = finalizeCall.parts as Array<{ type: string }>;
    expect(parts.find((p) => p.type === "agent_artifact_candidate_ref")).toBeUndefined();
  });

  it("Agentic V2 快照加载失败时安全失败轮次，不以 undefined context 继续", async () => {
    mocks.agenticV2Enabled = true;
    mocks.snapshotShouldThrow = true;

    const response = await handleStreamRequest({
      userId: "u1",
      conversationId: "c1",
      message: "你好",
      clientRequestId: "req-snap-fail",
    }, fakeSvc() as any);

    // 不应调用 TBox streaming（因为没有有效 context）
    expect(mocks.streamProgressive).not.toHaveBeenCalled();
    // 应调用 turnFail 安全失败
    expect(mocks.turnFail).toHaveBeenCalledWith(
      expect.objectContaining({
        turn: expect.objectContaining({
          id: "turn-1",
        }),
        code: "SNAPSHOT_LOAD_FAILED",
      }),
    );
    // 返回 JSON 错误（502）
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("SNAPSHOT_LOAD_FAILED");
    expect(body.error.message).toBe("职业上下文加载失败，请稍后重试");
    expect(JSON.stringify(body)).not.toContain("SNAPSHOT_TOO_LARGE");
    mocks.snapshotShouldThrow = false;
  });
});
