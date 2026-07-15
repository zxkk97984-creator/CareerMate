import { beforeEach, describe, expect, it, vi } from "vitest";

// 模拟 Prisma
const mockTx = {
  chatConversation: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  chatMessage: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
  questionLedger: {
    upsert: vi.fn(),
  },
};

const mockDb = {
  $transaction: vi.fn(),
  chatConversation: mockTx.chatConversation,
  chatMessage: mockTx.chatMessage,
  questionLedger: mockTx.questionLedger,
};

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => mockDb,
}));

import { createTurnService } from "./turn-service";

// 辅助：创建基础会话数据
function baseConv(overrides: Record<string, unknown> = {}) {
  return {
    id: "conv-1",
    userId: "user-1",
    title: "新对话",
    status: "active",
    remoteConversationId: null,
    state: "{}",
    contextVersion: 1,
    activeTurnId: null,
    activeTurnStartedAt: null,
    summary: "",
    lastSummarizedMessageId: null,
    remoteContextVersion: null,
    lastMessageAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function baseMsg(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    role: "user",
    content: "",
    parts: "[]",
    status: "completed",
    executionMeta: "{}",
    contextMeta: "{}",
    turnId: null,
    clientRequestId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("createTurnService", () => {
  let svc: ReturnType<typeof createTurnService>;

  beforeEach(() => {
    vi.resetAllMocks();
    svc = createTurnService();

    // 默认：$transaction 直接执行回调
    mockDb.$transaction.mockImplementation(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx));
    // 默认 mock——避免未设置的 mock 抛出异常
    mockTx.chatMessage.updateMany.mockResolvedValue({ count: 0 });
  });

  // ── begin ─────────────────────────────────────

  describe("begin", () => {
    it("新轮次：认领成功并创建消息", async () => {
      mockTx.chatConversation.findFirst.mockResolvedValue(baseConv());
      mockTx.chatMessage.findFirst.mockResolvedValue(null); // 无已有消息
      mockTx.chatConversation.updateMany.mockResolvedValue({ count: 1 });
      mockTx.chatConversation.update.mockResolvedValue(baseConv());
      mockTx.chatMessage.create
        .mockResolvedValueOnce(baseMsg({ id: "user-msg-1", role: "user", turnId: "turn_xxx", clientRequestId: "550e8400-e29b-41d4-a716-446655440000" }))
        .mockResolvedValueOnce(baseMsg({ id: "asst-msg-1", role: "assistant", status: "streaming", turnId: "turn_xxx" }));
      mockTx.questionLedger.upsert.mockResolvedValue({});

      const result = await svc.begin({
        userId: "user-1",
        conversationId: "conv-1",
        message: "你好",
        clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
      });

      expect(result.kind).toBe("new");
      if (result.kind === "new") {
        expect(result.turn.userMessageId).toBe("user-msg-1");
        expect(result.turn.assistantMessageId).toBe("asst-msg-1");
        expect(result.turn.clientRequestId).toBe("550e8400-e29b-41d4-a716-446655440000");
      }
      // 用户消息必须先于 TBox 调用创建
      const createCalls = mockTx.chatMessage.create.mock.calls;
      expect(createCalls[0][0].data.role).toBe("user");
      expect(createCalls[0][0].data.status).toBe("completed");
      expect(createCalls[1][0].data.role).toBe("assistant");
      expect(createCalls[1][0].data.status).toBe("streaming");
    });

    it("同一 clientRequestId 已完成 → replay", async () => {
      mockTx.chatConversation.findFirst.mockResolvedValue(baseConv());
      mockTx.chatMessage.findFirst
        .mockResolvedValueOnce(baseMsg({ id: "user-msg-1", role: "user", turnId: "turn_xxx", clientRequestId: "550e8400-e29b-41d4-a716-446655440000" })) // 已有用户消息
        .mockResolvedValueOnce(baseMsg({ id: "asst-msg-1", role: "assistant", status: "completed", content: "你好！有什么可以帮你的？", turnId: "turn_xxx" })); // 已有助手消息

      const result = await svc.begin({
        userId: "user-1",
        conversationId: "conv-1",
        message: "你好",
        clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
      });

      expect(result.kind).toBe("replay");
      if (result.kind === "replay") {
        expect(result.turn.assistantText).toBe("你好！有什么可以帮你的？");
      }
      // 不应再次调用 TBox（通过不创建新消息验证）
      expect(mockTx.chatMessage.create).not.toHaveBeenCalled();
    });

    it("同一 clientRequestId 仍在 streaming → 409", async () => {
      mockTx.chatConversation.findFirst.mockResolvedValue(baseConv());
      mockTx.chatMessage.findFirst
        .mockResolvedValueOnce(baseMsg({ id: "user-msg-1", role: "user", turnId: "turn_xxx", clientRequestId: "550e8400-e29b-41d4-a716-446655440000" }))
        .mockResolvedValueOnce(baseMsg({ id: "asst-msg-1", role: "assistant", status: "streaming", content: "你好！", turnId: "turn_xxx" }));

      await expect(svc.begin({
        userId: "user-1",
        conversationId: "conv-1",
        message: "你好",
        clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
      })).rejects.toMatchObject({ code: "TURN_IN_PROGRESS", status: 409 });
    });

    it("会话不存在 → NOT_FOUND", async () => {
      mockTx.chatConversation.findFirst.mockResolvedValue(null);

      await expect(svc.begin({
        userId: "user-1",
        conversationId: "conv-999",
        message: "你好",
        clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
      })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    });

    it("并发轮次：锁已被占用 → 409", async () => {
      mockTx.chatConversation.findFirst.mockResolvedValue(baseConv({ activeTurnId: "turn_other", activeTurnStartedAt: new Date() }));
      mockTx.chatMessage.findFirst.mockResolvedValue(null);
      mockTx.chatConversation.updateMany.mockResolvedValue({ count: 0 }); // 认领失败

      await expect(svc.begin({
        userId: "user-1",
        conversationId: "conv-1",
        message: "你好",
        clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
      })).rejects.toMatchObject({ code: "TURN_IN_PROGRESS", status: 409 });
    });

    it("超时锁可被接管（超过2分钟）", async () => {
      const oldLockTime = new Date(Date.now() - 3 * 60 * 1000); // 3分钟前
      mockTx.chatConversation.findFirst.mockResolvedValue(baseConv({ activeTurnId: "turn_old", activeTurnStartedAt: oldLockTime }));
      mockTx.chatMessage.findFirst.mockResolvedValue(null);
      mockTx.chatConversation.updateMany.mockResolvedValue({ count: 1 }); // 认领成功
      mockTx.chatConversation.update.mockResolvedValue(baseConv());
      mockTx.chatMessage.create
        .mockResolvedValueOnce(baseMsg({ id: "user-msg-1", role: "user", turnId: "turn_new" }))
        .mockResolvedValueOnce(baseMsg({ id: "asst-msg-1", role: "assistant", status: "streaming", turnId: "turn_new" }));
      mockTx.questionLedger.upsert.mockResolvedValue({});

      const result = await svc.begin({
        userId: "user-1",
        conversationId: "conv-1",
        message: "你好",
        clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
      });

      expect(result.kind).toBe("new");
    });
  });

  // ── finalize ──────────────────────────────────

  describe("finalize", () => {
    it("正常完成：更新消息并释放锁", async () => {
      mockTx.chatConversation.findUnique.mockResolvedValue(baseConv({ activeTurnId: "turn_xxx" }));
      mockTx.chatMessage.update.mockResolvedValue(baseMsg({ id: "asst-msg-1", role: "assistant", status: "completed", content: "你好！" }));
      mockTx.chatConversation.update.mockResolvedValue(baseConv());

      const result = await svc.finalize({
        turn: {
          id: "turn_xxx",
          conversationId: "conv-1",
          userId: "user-1",
          clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
          userMessageId: "user-msg-1",
          assistantMessageId: "asst-msg-1",
        },
        assistantText: "你好！有什么可以帮你的？",
        citations: [],
        executionMeta: { requestedMode: "mock", actualMode: "mock", degraded: false, source: "local-mock" },
        warnings: [],
      });

      expect(result.turnId).toBe("turn_xxx");
      expect(result.assistantText).toBe("你好！有什么可以帮你的？");

      // 验证消息更新
      const msgUpdateCall = mockTx.chatMessage.update.mock.calls[0][0];
      expect(msgUpdateCall.data.status).toBe("completed");

      // 验证锁释放
      const convUpdateCall = mockTx.chatConversation.update.mock.calls[0][0];
      expect(convUpdateCall.data.activeTurnId).toBeNull();
      expect(convUpdateCall.data.activeTurnStartedAt).toBeNull();
    });

    it("锁不匹配 → TURN_STALE", async () => {
      mockTx.chatConversation.findUnique.mockResolvedValue(baseConv({ activeTurnId: "turn_other" }));

      await expect(svc.finalize({
        turn: {
          id: "turn_xxx",
          conversationId: "conv-1",
          userId: "user-1",
          clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
          userMessageId: "user-msg-1",
          assistantMessageId: "asst-msg-1",
        },
        assistantText: "你好！",
        citations: [],
        executionMeta: {},
        warnings: [],
      })).rejects.toMatchObject({ code: "TURN_STALE", status: 409 });
    });

    it("保存远端 conversation ID", async () => {
      mockTx.chatConversation.findUnique.mockResolvedValue(baseConv({ activeTurnId: "turn_xxx" }));
      mockTx.chatMessage.update.mockResolvedValue(baseMsg({}));
      mockTx.chatConversation.update.mockResolvedValue(baseConv());

      await svc.finalize({
        turn: {
          id: "turn_xxx",
          conversationId: "conv-1",
          userId: "user-1",
          clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
          userMessageId: "user-msg-1",
          assistantMessageId: "asst-msg-1",
        },
        assistantText: "你好！",
        citations: [],
        remoteConversationId: "remote-123",
        executionMeta: {},
        warnings: [],
      });

      const convUpdateCall = mockTx.chatConversation.update.mock.calls[0][0];
      expect(convUpdateCall.data.remoteConversationId).toBe("remote-123");
    });

    it("contextVersion 递增", async () => {
      mockTx.chatConversation.findUnique.mockResolvedValue(baseConv({ activeTurnId: "turn_xxx", contextVersion: 3 }));
      mockTx.chatMessage.update.mockResolvedValue(baseMsg({}));
      mockTx.chatConversation.update.mockResolvedValue(baseConv());

      await svc.finalize({
        turn: {
          id: "turn_xxx",
          conversationId: "conv-1",
          userId: "user-1",
          clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
          userMessageId: "user-msg-1",
          assistantMessageId: "asst-msg-1",
        },
        assistantText: "你好！",
        citations: [],
        executionMeta: {},
        warnings: [],
      });

      const convUpdateCall = mockTx.chatConversation.update.mock.calls[0][0];
      expect(convUpdateCall.data.contextVersion).toBe(4); // 3 + 1
    });
  });

  // ── fail ──────────────────────────────────────

  describe("fail", () => {
    it("失败时保留部分文本并释放锁", async () => {
      mockTx.chatConversation.findUnique.mockResolvedValue(baseConv({ activeTurnId: "turn_xxx" }));
      mockTx.chatMessage.update.mockResolvedValue(baseMsg({}));
      mockTx.chatConversation.update.mockResolvedValue(baseConv());

      await svc.fail({
        turn: {
          id: "turn_xxx",
          conversationId: "conv-1",
          userId: "user-1",
          clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
          userMessageId: "user-msg-1",
          assistantMessageId: "asst-msg-1",
        },
        partialText: "部分内容...",
        code: "TBOX_UNAVAILABLE",
      });

      // 验证消息标记为 failed
      const msgUpdateCall = mockTx.chatMessage.update.mock.calls[0][0];
      expect(msgUpdateCall.data.status).toBe("failed");
      expect(msgUpdateCall.data.content).toBe("部分内容...");

      // 验证锁释放
      const convUpdateCall = mockTx.chatConversation.update.mock.calls[0][0];
      expect(convUpdateCall.data.activeTurnId).toBeNull();
    });

    it("锁已被覆盖时仍更新消息但不释放锁", async () => {
      mockTx.chatConversation.findUnique.mockResolvedValue(baseConv({ activeTurnId: "turn_other" }));
      mockTx.chatMessage.update.mockResolvedValue(baseMsg({}));

      await svc.fail({
        turn: {
          id: "turn_xxx",
          conversationId: "conv-1",
          userId: "user-1",
          clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
          userMessageId: "user-msg-1",
          assistantMessageId: "asst-msg-1",
        },
        partialText: "",
        code: "TBOX_UNAVAILABLE",
      });

      // 消息仍被更新为 failed
      expect(mockTx.chatMessage.update).toHaveBeenCalled();
      // 但锁不被释放（因为已被其他 turn 持有）
      expect(mockTx.chatConversation.update).not.toHaveBeenCalled();
    });
  });
});
