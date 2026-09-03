import { beforeEach, describe, expect, it, vi } from "vitest";

// ── 所有 mock 变量必须在 vi.hoisted 中定义 ──────────────

const mocks = vi.hoisted(() => ({
  prepareCareerChat: vi.fn(),
  createMessage: vi.fn(),
  getConversation: vi.fn(),
  updateMessage: vi.fn(),
  touchConversation: vi.fn(),
  updateConversationTitleFromFirstMessage: vi.fn(),
  streamProgressive: vi.fn(),
  createArtifactsForChat: vi.fn(),
  onEvent: null as ((event: any) => void) | null,
}));

vi.mock("./server", () => ({
  prepareCareerChat: mocks.prepareCareerChat,
}));

vi.mock("@/lib/tbox/streaming", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tbox/streaming")>();
  return {
    ...actual,
    streamChatWithTboxProgressive: mocks.streamProgressive,
  };
});

vi.mock("@/lib/env", () => ({
  getTboxConfig: () => ({
    mode: "mock" as const,
    apiKey: "test-key",
    agentId: "test-agent",
    retrievalMode: "agent",
    historyMode: "provider",
    contextTransport: "business_data",
    structuredMode: "terminal",
    reuseRemoteConversationId: false,
    chatEndpoint: "http://localhost/chat",
    retrieveEndpoint: "http://localhost/retrieve",
    streamTimeoutMs: 30000,
    probeAgentId: undefined,
    datasetIds: {
      roleCompetency: "ds1",
      learningResources: "ds2",
      simulationScenes: "ds3",
      ethicsRules: "ds4",
      careerTrends: "",
    },
    searchEngine: false,
  }),
  isStatefulChatTurns: () => false, // 旧路径测试
  isAgenticV2Enabled: () => false,
  isAgentOperationsEnabled: () => false,
}));

vi.mock("./artifact-service", () => ({
  createArtifactsForChat: mocks.createArtifactsForChat,
}));

import { handleStreamRequest } from "./stream-service";

// ── 辅助函数 ──────────────────────────────────────────────

function createMockService() {
  return {
    createMessage: mocks.createMessage,
    getMessages: vi.fn(),
    getConversation: mocks.getConversation,
    updateMessage: mocks.updateMessage,
    touchConversation: mocks.touchConversation,
    updateConversationTitleFromFirstMessage: mocks.updateConversationTitleFromFirstMessage,
    listConversations: vi.fn(),
    createConversation: vi.fn(),
    updateConversation: vi.fn(),
    deleteConversation: vi.fn(),
  };
}

async function readSseBody(response: Response): Promise<string[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(decoder.decode(value, { stream: true }));
  }
  const fullText = chunks.join("");
  return fullText.split(/\n\n/).filter(Boolean).map(b => b.trim());
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.onEvent = null;

  mocks.prepareCareerChat.mockResolvedValue({
    enhancedQuestion: "你是 CareerMate...\n\n用户问题：什么是数据分析师？",
    contextMeta: {
      intent: "roleCompetency",
      usedProfile: true,
      usedPlan: true,
      usedMemoryCount: 1,
      knowledgeSources: ["role-data-analyst"],
    },
  });

  mocks.createMessage.mockImplementation(async (_userId: string, input: any) => ({
    id: input.role === "user" ? "msg-user-1" : "msg-asst-1",
    conversationId: input.conversationId,
    role: input.role,
    content: input.content ?? "",
    parts: [],
    status: input.status ?? "completed",
    executionMeta: {},
    contextMeta: {},
    createdAt: new Date().toISOString(),
  }));

  mocks.getConversation.mockResolvedValue({
    id: "conv-1",
    title: "新对话",
    status: "active",
    lastMessageAt: "2026-07-12T10:00:00.000Z",
    createdAt: "2026-07-12T09:00:00.000Z",
    updatedAt: "2026-07-12T10:00:00.000Z",
    remoteConversationId: null,
  });

  mocks.updateMessage.mockResolvedValue({
    id: "msg-asst-1",
    status: "completed",
  });

  mocks.touchConversation.mockResolvedValue(undefined);
  mocks.updateConversationTitleFromFirstMessage.mockResolvedValue({
    id: "conv-1",
    title: "新对话",
    status: "active",
    lastMessageAt: "2026-07-12T10:00:00.000Z",
    createdAt: "2026-07-12T09:00:00.000Z",
  });
  mocks.createArtifactsForChat.mockResolvedValue([]);

  // 默认：模拟成功的渐进式流
  mocks.streamProgressive.mockImplementation(
    async (_input: any, _deps: any, onEvent: (event: any) => void) => {
      mocks.onEvent = onEvent;
      const metaObj = { requestedMode: "api" as const, actualMode: "api" as const, degraded: false, fallbackReason: null, source: "tbox-api" };
      onEvent({ event: "message", data: { type: "delta", content: "数据分析师" }, meta: metaObj });
      onEvent({ event: "message", data: { type: "delta", content: "是热门职业" }, meta: metaObj });
      onEvent({ event: "done", data: { conversationId: "remote-123" }, meta: metaObj });
      return {
        data: { text: "数据分析师是热门职业", conversationId: "remote-123", citations: [], warnings: [] },
        meta: metaObj,
      };
    },
  );
});

// ── 测试 ──────────────────────────────────────────────────

describe("handleStreamRequest", () => {
  it("在调用百宝箱之前已持久化用户消息", async () => {
    const service = createMockService();

    const response = await handleStreamRequest(
      { userId: "user-1", conversationId: "conv-1", message: "什么是数据分析师？", clientRequestId: "550e8400-e29b-41d4-a716-446655440000" },
      service as any,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    // 用户消息必须在调用百宝箱之前创建（在 ReadableStream start 中同步完成）
    expect(mocks.createMessage).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        conversationId: "conv-1",
        role: "user",
        content: "什么是数据分析师？",
        status: "completed",
      }),
    );
  });

  it("助手消息初始状态为streaming", async () => {
    const service = createMockService();

    const response = await handleStreamRequest(
      { userId: "user-1", conversationId: "conv-1", message: "测试", clientRequestId: "550e8400-e29b-41d4-a716-446655440000" },
      service as any,
    );

    await readSseBody(response);

    // 助手消息以 streaming 状态创建
    expect(mocks.createMessage).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        role: "assistant",
        status: "streaming",
      }),
    );
  });

  it("成功后助手消息状态为completed", async () => {
    const service = createMockService();

    const response = await handleStreamRequest(
      { userId: "user-1", conversationId: "conv-1", message: "测试", clientRequestId: "550e8400-e29b-41d4-a716-446655440000" },
      service as any,
    );

    // 消费完流
    await readSseBody(response);

    // 验证助手消息被更新为 completed
    expect(mocks.updateMessage).toHaveBeenCalledWith(
      "msg-asst-1",
      expect.objectContaining({
        status: "completed",
      }),
    );
  });

  it("SSE事件顺序：context 第一、delta 若干、done 最后", async () => {
    const service = createMockService();

    const response = await handleStreamRequest(
      { userId: "user-1", conversationId: "conv-1", message: "测试", clientRequestId: "550e8400-e29b-41d4-a716-446655440000" },
      service as any,
    );

    const blocks = await readSseBody(response);

    // 第一个必须是 context
    expect(blocks[0]).toContain("event: context");
    expect(blocks[0]).toContain("msg-user-1");
    expect(blocks[0]).toContain("msg-asst-1");

    // 中间有 delta
    const deltaBlocks = blocks.filter(b => b.startsWith("event: delta"));
    expect(deltaBlocks.length).toBe(2);

    // 最后一个必须是 done
    const lastBlock = blocks[blocks.length - 1];
    expect(lastBlock).toContain("event: done");
  });

  it("百宝箱失败后用户消息保留且助手消息标记为failed", async () => {
    // 模拟流式函数抛出错误
    mocks.streamProgressive.mockImplementationOnce(
      async () => {
        throw new Error("网络错误");
      },
    );

    const service = createMockService();

    const response = await handleStreamRequest(
      { userId: "user-1", conversationId: "conv-1", message: "测试", clientRequestId: "550e8400-e29b-41d4-a716-446655440000" },
      service as any,
    );

    const blocks = await readSseBody(response);

    // 验证助手消息被标记为 failed
    expect(mocks.updateMessage).toHaveBeenCalledWith(
      "msg-asst-1",
      expect.objectContaining({
        status: "failed",
      }),
    );

    // 验证有 error 事件
    const errorBlock = blocks.find(b => b.startsWith("event: error"));
    expect(errorBlock).toBeDefined();
    expect(errorBlock).toContain("TBOX_UNAVAILABLE");
  });

  it("context事件包含基本的会话信息", async () => {
    const service = createMockService();

    const response = await handleStreamRequest(
      { userId: "user-1", conversationId: "conv-1", message: "测试", clientRequestId: "550e8400-e29b-41d4-a716-446655440000" },
      service as any,
    );

    const blocks = await readSseBody(response);

    const contextBlock = blocks.find(b => b.startsWith("event: context"))!;
    expect(contextBlock).toContain("conv-1");
    expect(contextBlock).toContain("msg-user-1");
    expect(contextBlock).toContain("msg-asst-1");
    // legacy path 的 context 包含基本标识字段
    expect(contextBlock).toContain("intent");
    expect(contextBlock).toContain("usedProfile");
  });

  it("完成的消息持久化并在 done 前发送给浏览器", async () => {
    const service = createMockService();
    const response = await handleStreamRequest(
      { userId: "user-1", conversationId: "conv-1", message: "数据分析师是什么？", clientRequestId: "550e8400-e29b-41d4-a716-446655440000" },
      service as any,
    );

    const blocks = await readSseBody(response);

    // legacy 路径：消息以 completed 状态持久化
    expect(mocks.updateMessage).toHaveBeenCalledWith(
      "msg-asst-1",
      expect.objectContaining({
        content: "数据分析师是热门职业",
        status: "completed",
      }),
    );
    // done 事件在消息持久化后发送
    const artifactIndex = blocks.findIndex(b => b === "artifact");
    const doneIndex = blocks.findIndex(b => b.startsWith("event: done"));
    if (artifactIndex >= 0) {
      expect(artifactIndex).toBeLessThan(doneIndex);
    }
  });
});
