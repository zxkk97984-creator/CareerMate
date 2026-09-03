import { z } from "zod";
import { aiCareerPlanV2Schema } from "@/lib/plans/schema-v2";

// ── 基础类型 ────────────────────────────────────

export const quickActionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(500),
}).strict();

export type QuickAction = z.infer<typeof quickActionSchema>;

export const AGENT_INTENTS = [
  "career_advice",
  "career_research",
  "profile_guidance",
  "plan_generation",
  "plan_revision",
  "general",
  "privacy",
] as const;

export type AgentIntent = (typeof AGENT_INTENTS)[number];

// ── AgentQuestion ────────────────────────────────

export const agentQuestionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  normalizedKey: z.string().trim().min(3).max(120).regex(/^[a-z0-9:_-]+$/),
  text: z.string().trim().min(1).max(500),
  profileField: z.enum([
    "educationStage",
    "major",
    "targetRole",
    "weeklyAvailableHours",
    "learningPreference",
    "experienceSummary",
    "constraints",
  ]).optional(),
  answerKind: z.enum(["free_text", "number", "single_choice", "confirmation"]),
  actions: z.array(quickActionSchema).max(6),
}).strict();

export type AgentQuestion = z.infer<typeof agentQuestionSchema>;

// ── AgentSourceRef ───────────────────────────────

/** 来源类型：知识库检索 / 联网搜索 / AI推断 */
export const agentSourceRefSchema = z.object({
  id: z.string().trim().min(1).max(120),
  /** 来源分类：knowledge_base（知识库）/ web_search（联网搜索）/ ai_inference（AI推断） */
  kind: z.enum(["knowledge_base", "web_search", "ai_inference"]),
  /** 在 citations 数组中的索引（从0开始），与 NormalizedCitation.providerIndex 对齐 */
  citationIndex: z.number().int().min(0).optional(),
  /** 工具类型（如 knowledge/夸克搜索），匹配 agentic_tool_start.toolType */
  toolType: z.string().trim().max(60).optional(),
  /** 来源标题 */
  title: z.string().trim().max(240).optional(),
  /** 外部 URL（仅在 web_search 且 URL 校验通过时设置） */
  url: z.string().url().max(2000).optional(),
  /** 相关度分数（知识库检索时填写） */
  relevance: z.number().min(0).max(1).optional(),
  /** 补充说明 */
  note: z.string().trim().max(500).optional(),
}).strict();

export type AgentSourceRef = z.infer<typeof agentSourceRefSchema>;

// ── AgentOperation（联合类型）────────────────────

/** 画像 patch 中允许的字段白名单，禁止写入敏感信息 */
const ALLOWED_PATCH_FIELDS = [
  "educationStage",
  "major",
  "targetRole",
  "weeklyAvailableHours",
  "learningPreference",
  "experienceSummary",
  "interestTags",
  "constraints",
] as const;

/** targetRole 子对象 Schema */
const targetRolePatchSchema = z.object({
  key: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(160),
}).strict();

const patchValueSchema = z.union([
  z.string().trim().min(1).max(2000),
  z.number().int().min(1).max(168),
  z.array(z.string().trim().min(1).max(240)).max(20),
  targetRolePatchSchema,
  z.null(),
]);

const profilePatchRecordSchema = z.record(
  z.enum(ALLOWED_PATCH_FIELDS),
  patchValueSchema,
).refine(
  (rec) => Object.keys(rec).length > 0,
  { message: "patch 必须至少包含一个允许的字段" },
);

export const profilePatchOperationSchema = z.object({
  id: z.string().trim().min(1).max(120),
  type: z.literal("profile_patch"),
  patch: profilePatchRecordSchema,
  sourceKind: z.enum(["explicit", "inferred"]),
  confidence: z.number().min(0).max(1),
  evidenceExcerpt: z.string().trim().max(2000),
  reason: z.string().trim().min(1).max(500),
  sensitive: z.boolean(),
}).strict();

export const memoryProposalOperationSchema = z.object({
  id: z.string().trim().min(1).max(120),
  type: z.literal("memory_proposal"),
  content: z.string().trim().min(1).max(2000),
  kind: z.enum(["career_fact", "preference", "constraint", "goal"]),
  sourceKind: z.enum(["explicit_remember", "agent_proposal"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(1).max(500),
  sensitive: z.boolean(),
}).strict();

export const planDraftOperationSchema = z.object({
  id: z.string().trim().min(1).max(120),
  type: z.literal("plan_draft"),
  plan: aiCareerPlanV2Schema,
}).strict();

export const explorationReportOperationSchema = z.object({
  id: z.string().trim().min(1).max(120),
  type: z.literal("exploration_report"),
  report: z.record(z.string(), z.unknown()).refine(
    (r) => Object.keys(r).length > 0,
    { message: "exploration_report.report 不能为空对象" },
  ),
}).strict();

export const agentOperationSchema = z.discriminatedUnion("type", [
  profilePatchOperationSchema,
  memoryProposalOperationSchema,
  planDraftOperationSchema,
  explorationReportOperationSchema,
]);

export type AgentOperation = z.infer<typeof agentOperationSchema>;

// ── AgentResponse ────────────────────────────────

export const agentResponseSchema = z.object({
  schemaVersion: z.literal(1),
  intent: z.enum(AGENT_INTENTS),
  task: z.object({
    kind: z.enum(["idle", "profile_guidance", "career_research", "plan_generation", "plan_revision", "general"]),
    status: z.enum(["idle", "collecting", "ready", "waiting_confirmation", "completed"]),
    goal: z.string().trim().max(500).optional(),
  }).strict(),
  questions: z.array(agentQuestionSchema).max(1),
  operations: z.array(agentOperationSchema),
  sourceRefs: z.array(agentSourceRefSchema),
}).strict();

export type AgentResponse = z.infer<typeof agentResponseSchema>;
