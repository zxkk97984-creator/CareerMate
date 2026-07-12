import type { Prisma } from "@prisma/client";
import { parseChatMessageParts, titleFromFirstMessage } from "./persistence";
import {
  createChatRepository,
  type ChatRepository,
  type CreateMessageInput,
  type UpdateMessageInput,
} from "./repository";
import type {
  ConversationItem,
  MessageItem,
} from "./schemas";

// ── 错误 ──────────────────────────────────────────────────

export class ServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

function notFound(entity: string) {
  return new ServiceError(`${entity}不存在`, "NOT_FOUND", 404);
}

function badRequest(message: string) {
  return new ServiceError(message, "BAD_REQUEST", 400);
}

// ── DTO 转换 ──────────────────────────────────────────────

/** 将数据库行转为 DTO */
function toConversationItem(row: {
  id: string;
  title: string;
  status: string;
  remoteConversationId?: string | null;
  lastMessageAt: Date;
  createdAt: Date;
}): ConversationItem {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    remoteConversationId: row.remoteConversationId ?? null,
    lastMessageAt: row.lastMessageAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toMessageItem(row: {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  parts: string;
  status: string;
  executionMeta: string;
  contextMeta: string;
  createdAt: Date;
}): MessageItem {
  let parsedParts: unknown[];
  let parsedExec: unknown;
  let parsedCtx: unknown;
  try { parsedParts = parseChatMessageParts(row.parts); } catch { parsedParts = []; }
  try { parsedExec = JSON.parse(row.executionMeta); } catch { parsedExec = {}; }
  try { parsedCtx = JSON.parse(row.contextMeta); } catch { parsedCtx = {}; }

  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    parts: parsedParts,
    status: row.status,
    executionMeta: parsedExec,
    contextMeta: parsedCtx,
    createdAt: row.createdAt.toISOString(),
  };
}

// ── 服务 ──────────────────────────────────────────────────

export interface ChatService {
  // 会话
  listConversations(
    userId: string,
    cursor?: string,
    limit?: number,
  ): Promise<{ items: ConversationItem[]; nextCursor: string | null }>;

  createConversation(
    userId: string,
    title?: string,
  ): Promise<ConversationItem>;

  getConversation(
    id: string,
    userId: string,
  ): Promise<ConversationDetail | null>;

  updateConversation(
    id: string,
    userId: string,
    title: string,
  ): Promise<ConversationItem>;

  deleteConversation(
    id: string,
    userId: string,
  ): Promise<ConversationItem>;

  updateConversationTitleFromFirstMessage(
    id: string,
    userId: string,
    message: string,
  ): Promise<ConversationItem>;

  // 消息
  getMessages(
    conversationId: string,
    userId: string,
    before?: string,
    limit?: number,
  ): Promise<MessageItem[]>;

  createMessage(
    userId: string,
    input: CreateMessageInput,
  ): Promise<MessageItem>;

  updateMessage(
    messageId: string,
    data: UpdateMessageInput,
  ): Promise<MessageItem>;

  // 会话时间与远端 ID
  touchConversation(id: string, remoteConversationId?: string): Promise<void>;
}

export function createChatService(repo?: ChatRepository): ChatService {
  const r = repo ?? createChatRepository();

  return {
    // ── 会话列表 ──────────────────────────────────────
    async listConversations(userId, cursor, limit = 30) {
      const rows = await r.listConversations(userId, cursor, limit);
      const take = limit;
      const items = rows.slice(0, take).map(toConversationItem);
      const nextCursor = rows.length > take ? rows[take - 1]?.id ?? null : null;
      return { items, nextCursor };
    },

    // ── 创建会话 ──────────────────────────────────────
    async createConversation(userId, title) {
      const row = await r.createConversation(
        userId,
        (title ?? "新对话").trim() || "新对话",
      );
      return toConversationItem(row);
    },

    // ── 获取会话 ──────────────────────────────────────
    async getConversation(id, userId) {
      const row = await r.findConversation(id, userId);
      if (!row) return null;
      return {
        ...toConversationItem(row),
        remoteConversationId: row.remoteConversationId ?? null,
        updatedAt: row.updatedAt.toISOString(),
      };
    },

    // ── 更新会话标题 ──────────────────────────────────
    async updateConversation(id, userId, title) {
      const trimmed = title.trim();
      if (trimmed.length < 1 || trimmed.length > 60) {
        throw badRequest("标题长度需在1到60个字符之间");
      }

      const existing = await r.findConversation(id, userId);
      if (!existing) throw notFound("会话");

      const row = await r.updateConversation(id, { title: trimmed });
      return toConversationItem(row);
    },

    // ── 软删除 ────────────────────────────────────────
    async deleteConversation(id, userId) {
      const existing = await r.findConversation(id, userId);
      if (!existing) throw notFound("会话");

      const row = await r.updateConversation(id, { status: "deleted" });
      return toConversationItem(row);
    },

    // ── 首条消息自动标题 ──────────────────────────────
    async updateConversationTitleFromFirstMessage(id, userId, message) {
      const existing = await r.findConversation(id, userId);
      if (!existing) throw notFound("会话");

      // 只在标题仍为默认值时自动更新
      if (existing.title !== "新对话") {
        return toConversationItem(existing);
      }

      const newTitle = titleFromFirstMessage(message);
      const row = await r.updateConversation(id, { title: newTitle });
      return toConversationItem(row);
    },

    // ── 获取消息 ──────────────────────────────────────
    async getMessages(conversationId, userId, before, limit = 50) {
      // 先检查会话所有权
      const conv = await r.findConversation(conversationId, userId);
      if (!conv) throw notFound("会话");

      const rows = await r.listMessages(conversationId, before, limit);
      return rows.slice(-limit).map(toMessageItem);
    },

    // ── 创建消息 ──────────────────────────────────────
    async createMessage(userId, input) {
      // 验证会话归属，防止跨用户写入
      const conv = await r.findConversation(input.conversationId, userId);
      if (!conv) throw notFound("会话");
      const row = await r.createMessage(input);
      return toMessageItem(row);
    },

    // ── 更新消息 ──────────────────────────────────────
    async updateMessage(messageId, data) {
      const row = await r.updateMessage(messageId, data);
      return toMessageItem(row);
    },

    // ── 更新会话时间与远端 ID ──────────────────────────
    async touchConversation(id, remoteConversationId) {
      const data: Prisma.ChatConversationUpdateInput = { lastMessageAt: new Date() };
      if (remoteConversationId) {
        data.remoteConversationId = remoteConversationId;
      }
      await r.updateConversation(id, data);
    },
  };
}

// ── 补充 DTO 类型 ────────────────────────────────────────

export type ConversationDetail = ConversationItem & {
  updatedAt: string;
};
