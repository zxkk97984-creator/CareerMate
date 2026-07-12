import { describe, expect, it, vi } from "vitest";
import { getPrisma } from "@/lib/prisma";

// Mock Prisma 客户端，让测试不接触真实数据库
vi.mock("@/lib/prisma", () => ({
  getPrisma: vi.fn(),
}));

// 在所有 mock 设置完成后，再导入被测模块
// 因为 service.ts 导入了 getPrisma，必须在 mock 之后 import
const { createChatService } = await import("./service");

// ---- 辅助函数 ----

/** 模拟一条数据库会话行 */
function conversationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "conv-1",
    userId: "user-1",
    title: "新对话",
    status: "active",
    remoteConversationId: null,
    lastMessageAt: new Date("2026-07-12T10:00:00Z"),
    createdAt: new Date("2026-07-12T09:00:00Z"),
    updatedAt: new Date("2026-07-12T10:00:00Z"),
    ...overrides,
  };
}

/** 模拟一条数据库消息行 */
function messageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    role: "user",
    content: "你好",
    parts: "[]",
    status: "completed",
    executionMeta: "{}",
    contextMeta: "{}",
    createdAt: new Date("2026-07-12T10:00:00Z"),
    updatedAt: new Date("2026-07-12T10:00:00Z"),
    ...overrides,
  };
}

/** 创建一个带有模拟 Prisma 的 ChatService 实例 */
function setupService() {
  const mockPrisma = {
    chatConversation: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    chatMessage: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    $transaction: vi.fn((fn: (...args: unknown[]) => unknown) => fn(mockPrisma)),
  };

  (getPrisma as any).mockReturnValue(mockPrisma);

  const service = createChatService();
  return { service, mock: mockPrisma };
}

// ---- 测试 ----

describe("ChatService", () => {
  describe("listConversations", () => {
    it("只返回当前用户且状态非deleted的会话", async () => {
      const { service, mock } = setupService();
      const rows = [conversationRow({ id: "c1" }), conversationRow({ id: "c2" })];
      mock.chatConversation.findMany.mockResolvedValue(rows);

      const result = await service.listConversations("user-1");

      expect(result.items).toHaveLength(2);
      expect(mock.chatConversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1", status: { not: "deleted" } },
        }),
      );
    });

    it("支持基于游标的分页", async () => {
      const { service, mock } = setupService();
      const rows = [conversationRow({ id: "c3" })];
      mock.chatConversation.findMany.mockResolvedValue(rows);

      const result = await service.listConversations("user-1", "cursor-abc", 30);

      expect(result.items).toHaveLength(1);
      expect(mock.chatConversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: "cursor-abc" },
          take: 31, // limit + 1 用于判断是否有更多
        }),
      );
    });

    it("按lastMessageAt降序排列", async () => {
      const { service, mock } = setupService();
      mock.chatConversation.findMany.mockResolvedValue([]);

      await service.listConversations("user-1");

      expect(mock.chatConversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { lastMessageAt: "desc" },
        }),
      );
    });

    it("返回nextCursor为null时表示没有更多数据", async () => {
      const { service, mock } = setupService();
      mock.chatConversation.findMany.mockResolvedValue([conversationRow()]);

      const result = await service.listConversations("user-1", undefined, 30);

      expect(result.nextCursor).toBeNull();
    });

    it("返回nextCursor表示还有更多数据", async () => {
      const { service, mock } = setupService();
      const rows = Array.from({ length: 31 }, (_, i) => conversationRow({ id: `c${i}` }));
      mock.chatConversation.findMany.mockResolvedValue(rows);

      const result = await service.listConversations("user-1", undefined, 30);

      expect(result.nextCursor).toBe("c29"); // 第30个的id（0-indexed）
    });
  });

  describe("createConversation", () => {
    it("创建新会话并默认标题为'新对话'", async () => {
      const { service, mock } = setupService();
      const row = conversationRow({ title: "新对话" });
      mock.chatConversation.create.mockResolvedValue(row);

      const result = await service.createConversation("user-1");

      expect(result.title).toBe("新对话");
      expect(mock.chatConversation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-1",
          title: "新对话",
        }),
      });
    });

    it("支持自定义标题", async () => {
      const { service, mock } = setupService();
      const row = conversationRow({ title: "探索用户研究职业" });
      mock.chatConversation.create.mockResolvedValue(row);

      const result = await service.createConversation("user-1", "探索用户研究职业");

      expect(result.title).toBe("探索用户研究职业");
    });
  });

  describe("getConversation", () => {
    it("返回属于当前用户且状态active的会话", async () => {
      const { service, mock } = setupService();
      const row = conversationRow({ id: "conv-1", userId: "user-1" });
      mock.chatConversation.findFirst.mockResolvedValue(row);

      const result = await service.getConversation("conv-1", "user-1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("conv-1");
      expect(mock.chatConversation.findFirst).toHaveBeenCalledWith({
        where: { id: "conv-1", userId: "user-1", status: { not: "deleted" } },
      });
    });

    it("他人会话返回null", async () => {
      const { service, mock } = setupService();
      mock.chatConversation.findFirst.mockResolvedValue(null);

      const result = await service.getConversation("conv-1", "user-2");

      expect(result).toBeNull();
    });

    it("deleted会话返回null", async () => {
      const { service, mock } = setupService();
      mock.chatConversation.findFirst.mockResolvedValue(null);

      const result = await service.getConversation("conv-1", "user-1");

      expect(result).toBeNull();
    });
  });

  describe("updateConversation", () => {
    it("标题去除首尾空白", async () => {
      const { service, mock } = setupService();
      const row = conversationRow({ id: "conv-1", title: "转行用户研究" });
      mock.chatConversation.findFirst.mockResolvedValue(conversationRow({ id: "conv-1", userId: "user-1" }));
      mock.chatConversation.update.mockResolvedValue(row);

      const result = await service.updateConversation("conv-1", "user-1", "  转行用户研究  ");

      expect(result.title).toBe("转行用户研究");
    });

    it("标题长度1–60字符校验", async () => {
      const { service } = setupService();

      await expect(service.updateConversation("conv-1", "user-1", "")).rejects.toThrow("标题长度需在1到60个字符之间");
      await expect(service.updateConversation("conv-1", "user-1", "a".repeat(61))).rejects.toThrow("标题长度需在1到60个字符之间");
    });

    it("不能修改他人会话", async () => {
      const { service, mock } = setupService();
      // findFirst 查不到（因为userId不匹配）
      mock.chatConversation.findFirst.mockResolvedValue(null);

      await expect(service.updateConversation("conv-1", "user-2", "新标题")).rejects.toThrow("会话不存在");
    });

    it("不能修改已删除的会话", async () => {
      const { service, mock } = setupService();
      mock.chatConversation.findFirst.mockResolvedValue(null); // deleted会话查不到

      await expect(service.updateConversation("conv-1", "user-1", "新标题")).rejects.toThrow("会话不存在");
    });

    it("通过首条用户消息更新标题", async () => {
      const { service, mock } = setupService();
      mock.chatConversation.findFirst.mockResolvedValue(conversationRow({ id: "conv-1", userId: "user-1" }));
      const updated = conversationRow({ id: "conv-1", title: "我想转行做用户研究…" });
      mock.chatConversation.update.mockResolvedValue(updated);

      const result = await service.updateConversationTitleFromFirstMessage(
        "conv-1",
        "user-1",
        "我想转行做用户研究",
      );

      expect(result.title).toBe("我想转行做用户研究…");
      expect(mock.chatConversation.update).toHaveBeenCalledWith({
        where: { id: "conv-1" },
        data: expect.objectContaining({ title: expect.stringContaining("我想转行做用户研究") }),
      });
    });

    it("如果当前标题不是默认标题则不更新", async () => {
      const { service, mock } = setupService();
      mock.chatConversation.findFirst.mockResolvedValue(
        conversationRow({ id: "conv-1", userId: "user-1", title: "已有自定义标题" }),
      );

      const result = await service.updateConversationTitleFromFirstMessage(
        "conv-1",
        "user-1",
        "新的用户消息",
      );

      // 不调用update，返回现有会话
      expect(mock.chatConversation.update).not.toHaveBeenCalled();
      expect(result.title).toBe("已有自定义标题");
    });
  });

  describe("deleteConversation", () => {
    it("软删除将status设为deleted", async () => {
      const { service, mock } = setupService();
      mock.chatConversation.findFirst.mockResolvedValue(conversationRow({ id: "conv-1", userId: "user-1" }));
      const deleted = conversationRow({ id: "conv-1", status: "deleted" });
      mock.chatConversation.update.mockResolvedValue(deleted);

      const result = await service.deleteConversation("conv-1", "user-1");

      expect(result.status).toBe("deleted");
      expect(mock.chatConversation.update).toHaveBeenCalledWith({
        where: { id: "conv-1" },
        data: { status: "deleted" },
      });
    });

    it("不能删除他人会话", async () => {
      const { service, mock } = setupService();
      mock.chatConversation.findFirst.mockResolvedValue(null);

      await expect(service.deleteConversation("conv-1", "user-2")).rejects.toThrow("会话不存在");
    });
  });

  describe("getMessages", () => {
    it("返回会话消息按创建时间升序", async () => {
      const { service, mock } = setupService();
      mock.chatConversation.findFirst.mockResolvedValue(conversationRow({ id: "conv-1", userId: "user-1" }));
      const rows = [
        messageRow({ id: "m2", createdAt: new Date("2026-07-12T10:01:00Z") }),
        messageRow({ id: "m1", createdAt: new Date("2026-07-12T10:00:00Z") }),
      ];
      mock.chatMessage.findMany.mockResolvedValue(rows);

      const result = await service.getMessages("conv-1", "user-1");

      expect(result).toHaveLength(2);
      expect(result.map((message) => message.id)).toEqual(["m1", "m2"]);
      expect(mock.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversationId: "conv-1" },
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("跨用户不能访问消息（会话所有权检查）", async () => {
      const { service, mock } = setupService();
      mock.chatConversation.findFirst.mockResolvedValue(null);

      await expect(service.getMessages("conv-1", "user-2")).rejects.toThrow("会话不存在");
    });

    it("非法parts JSON回退为空数组", async () => {
      const { service, mock } = setupService();
      mock.chatConversation.findFirst.mockResolvedValue(conversationRow({ id: "conv-1", userId: "user-1" }));
      const rows = [
        messageRow({ id: "m3", parts: '[{"type":"text","text":"有效"}]' }),
        messageRow({ id: "m2", parts: "null" }),
        messageRow({ id: "m1", parts: "invalid json!!" }),
      ];
      mock.chatMessage.findMany.mockResolvedValue(rows);

      const result = await service.getMessages("conv-1", "user-1");

      // 非法JSON和null都回退为空数组
      expect(result[0].parts).toEqual([]);
      expect(result[1].parts).toEqual([]);
      // 合法JSON正常解析
      expect(result[2].parts).toEqual([{ type: "text", text: "有效" }]);
    });

    it("支持before游标分页", async () => {
      const { service, mock } = setupService();
      mock.chatConversation.findFirst.mockResolvedValue(conversationRow({ id: "conv-1", userId: "user-1" }));
      mock.chatMessage.findMany.mockResolvedValue([]);

      await service.getMessages("conv-1", "user-1", "msg-50", 50);

      expect(mock.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: "msg-50" },
          take: 51,
          skip: 1, // 跳过游标自身
        }),
      );
    });
  });
});
