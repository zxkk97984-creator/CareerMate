import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// ── 类型 ──────────────────────────────────────────────────

/** 从数据库查出的会话行（Prisma 查询返回类型） */
type ConversationRow = {
  id: string;
  userId: string;
  title: string;
  status: string;
  state: string;
  contextVersion: number;
  summary: string;
  remoteConversationId: string | null;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

/** 从数据库查出的消息行 */
type MessageRow = {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  parts: string;
  status: string;
  executionMeta: string;
  contextMeta: string;
  createdAt: Date;
  updatedAt: Date;
};

/** 创建消息参数 */
export type CreateMessageInput = {
  conversationId: string;
  role: string;
  content?: string;
  parts?: string;
  status?: string;
  executionMeta?: string;
  contextMeta?: string;
};

/** 更新消息参数 */
export type UpdateMessageInput = {
  content?: string;
  parts?: string;
  status?: string;
  executionMeta?: string;
  contextMeta?: string;
};

/** 仓储接口——所有查询必须绑定 userId 以隔离用户数据 */
export interface ChatRepository {
  // 会话
  listConversations(
    userId: string,
    cursor?: string,
    limit?: number,
  ): Promise<ConversationRow[]>;

  findConversation(
    id: string,
    userId: string,
  ): Promise<ConversationRow | null>;

  createConversation(
    userId: string,
    title: string,
  ): Promise<ConversationRow>;

  updateConversation(
    id: string,
    data: Prisma.ChatConversationUpdateInput,
  ): Promise<ConversationRow>;

  // 消息
  listMessages(
    conversationId: string,
    before?: string,
    limit?: number,
  ): Promise<MessageRow[]>;

  createMessage(input: CreateMessageInput): Promise<MessageRow>;

  updateMessage(
    id: string,
    data: UpdateMessageInput,
  ): Promise<MessageRow>;
}

// ── Prisma 实现 ───────────────────────────────────────────

export function createChatRepository(): ChatRepository {
  const db = getPrisma();

  return {
    // 列表：用户 + 非deleted
    async listConversations(userId, cursor, limit = 30) {
      const take = limit + 1; // 多取一条用于判断是否有下一页
      return (await db.chatConversation.findMany({
        where: { userId, status: { not: "deleted" } },
        orderBy: { lastMessageAt: "desc" },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take,
      })) as unknown as ConversationRow[];
    },

    // 查找单个：用户 + 非deleted
    async findConversation(id, userId) {
      return (await db.chatConversation.findFirst({
        where: { id, userId, status: { not: "deleted" } },
      })) as ConversationRow | null;
    },

    // 创建
    async createConversation(userId, title) {
      return (await db.chatConversation.create({
        data: { userId, title },
      })) as unknown as ConversationRow;
    },

    // 更新
    async updateConversation(id, data) {
      return (await db.chatConversation.update({
        where: { id },
        data,
      })) as unknown as ConversationRow;
    },

    // 先取游标之前最近的一页，再反转为前端需要的时间升序。
    async listMessages(conversationId, before, limit = 50) {
      const rows = await db.chatMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: "desc" },
        ...(before ? { cursor: { id: before }, skip: 1 } : {}),
        take: limit + 1,
      });
      return rows.reverse() as unknown as MessageRow[];
    },

    // 创建消息
    async createMessage(input) {
      return (await db.chatMessage.create({
        data: {
          conversationId: input.conversationId,
          role: input.role,
          content: input.content ?? "",
          parts: input.parts ?? "[]",
          status: input.status ?? "completed",
          executionMeta: input.executionMeta ?? "{}",
          contextMeta: input.contextMeta ?? "{}",
        },
      })) as unknown as MessageRow;
    },

    // 更新消息
    async updateMessage(id, data) {
      return (await db.chatMessage.update({
        where: { id },
        data,
      })) as unknown as MessageRow;
    },
  };
}
