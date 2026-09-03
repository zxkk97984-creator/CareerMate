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
const AGENTIC_V2_INTERACTIONS = {
  chat: ["message_submit", "quick_action"],
  onboarding: ["message_submit", "submit_profile", "upload_resume"],
  dashboard: ["message_submit", "review_progress"],
  career_path: ["message_submit", "generate_plan", "regenerate_plan", "review_plan"],
  career_exploration: ["message_submit", "compare_careers", "research_career"],
  learning_route: ["message_submit", "generate_route", "adjust_route", "update_progress"],
  simulation: ["message_submit", "start_simulation", "continue_simulation", "reset_simulation", "complete_simulation"],
  resume: ["message_submit", "upload_document", "analyze_document"],
  resources: ["message_submit", "search_resources", "verify_resource"],
  growth_review: ["message_submit", "run_review"],
  memory: ["message_submit", "view_memory", "propose_memory", "accept_candidate", "reject_candidate", "delete_memory"],
  privacy: ["message_submit", "view_data", "export_data", "delete_data"],
} as const;

const agenticV2SurfaceSchema = z.enum(Object.keys(AGENTIC_V2_INTERACTIONS) as [
  keyof typeof AGENTIC_V2_INTERACTIONS,
  ...(keyof typeof AGENTIC_V2_INTERACTIONS)[],
]);

export const agenticV2InteractionSchema = z.object({
  surface: agenticV2SurfaceSchema,
  action: z.string().trim().min(1).max(40),
}).strict().superRefine((value, ctx) => {
  const allowed = AGENTIC_V2_INTERACTIONS[value.surface] as readonly string[];
  if (!allowed.includes(value.action)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["action"],
      message: "页面上下文只能描述界面状态，不能指定 Agent 的实现方式",
    });
  }
});

export const sendMessageInputSchema = z.object({
  message: z
    .string()
    .min(1, "消息不能为空")
    .max(8000, "消息不能超过8000个字符"),
  clientRequestId: z.string().uuid("请求ID必须是有效的UUID"),
  actionId: z.string().trim().min(1).max(120).optional(),
  interaction: agenticV2InteractionSchema.optional(),
}).strict();

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
