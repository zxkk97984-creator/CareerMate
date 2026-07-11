import { z } from "zod";

// ── 引用标签 ──────────────────────────────────────────────
export const citationLabelSchema = z.enum([
  "已核验职业库",
  "实时联网调研",
  "AI分析与推断",
]);

// ── API 输入 ──────────────────────────────────────────────

/** 创建会话 */
export const createConversationInputSchema = z.object({
  title: z.string().max(60).optional(),
});

/** 更新会话 */
export const updateConversationInputSchema = z.object({
  title: z
    .string()
    .min(1, "标题不能为空")
    .max(60, "标题不能超过60个字符"),
});

/** 会话列表查询参数 */
export const listConversationsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

/** 消息列表查询参数 */
export const listMessagesQuerySchema = z.object({
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** 发送消息请求 */
export const sendMessageInputSchema = z.object({
  message: z
    .string()
    .min(1, "消息不能为空")
    .max(8000, "消息不能超过8000个字符"),
});

// ── DTO ───────────────────────────────────────────────────

/** 会话列表项 DTO */
export const conversationItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  remoteConversationId: z.string().nullable().optional(),
  lastMessageAt: z.string(),
  createdAt: z.string(),
});

/** 消息 DTO */
export const messageItemSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.string(),
  content: z.string(),
  parts: z.array(z.unknown()),
  status: z.string(),
  executionMeta: z.unknown(),
  contextMeta: z.unknown(),
  createdAt: z.string(),
});

/** 会话详情（含更新时间） */
export const conversationDetailSchema = conversationItemSchema.extend({
  updatedAt: z.string(),
  remoteConversationId: z.string().nullable(),
});

// ── SSE 事件 ──────────────────────────────────────────────

export const sseContextEventSchema = z.object({
  conversationId: z.string(),
  userMessageId: z.string(),
  assistantMessageId: z.string(),
  intent: z.string().nullable(),
  usedProfile: z.boolean(),
  usedPlan: z.boolean(),
  usedMemoryCount: z.number().int().min(0),
  knowledgeSources: z.array(z.string()),
});

export const sseDeltaEventSchema = z.object({
  messageId: z.string(),
  text: z.string(),
});

export const sseArtifactEventSchema = z.object({
  messageId: z.string(),
  part: z.unknown(),
});

export const sseDoneEventSchema = z.object({
  messageId: z.string(),
  remoteConversationId: z.string().nullable(),
  status: z.enum(["completed", "failed", "stopped"]),
  meta: z.object({
    requestedMode: z.string(),
    actualMode: z.string(),
    degraded: z.boolean(),
    fallbackReason: z.string().nullable(),
    source: z.string(),
  }),
});

export const sseErrorEventSchema = z.object({
  messageId: z.string().nullable(),
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
});

// ── 导出类型 ──────────────────────────────────────────────

export type CreateConversationInput = z.infer<typeof createConversationInputSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationInputSchema>;
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;

export type ConversationItem = z.infer<typeof conversationItemSchema>;
export type MessageItem = z.infer<typeof messageItemSchema>;

export type SseContextEvent = z.infer<typeof sseContextEventSchema>;
export type SseDeltaEvent = z.infer<typeof sseDeltaEventSchema>;
export type SseArtifactEvent = z.infer<typeof sseArtifactEventSchema>;
export type SseDoneEvent = z.infer<typeof sseDoneEventSchema>;
export type SseErrorEvent = z.infer<typeof sseErrorEventSchema>;
