import { z } from "zod";
import { aiCareerPlanV2Schema } from "@/lib/plans/schema-v2";

const shortText = z.string().trim().min(1).max(500);

export type SerializableJsonValue =
  | null
  | boolean
  | number
  | string
  | SerializableJsonValue[]
  | { [key: string]: SerializableJsonValue };

function isSerializableJsonValue(value: unknown): value is SerializableJsonValue {
  const ancestors = new Set<object>();
  const stack: Array<{ value: unknown; leaving?: object }> = [{ value }];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) return false;
    if (current.leaving) {
      ancestors.delete(current.leaving);
      continue;
    }

    if (current.value === null || typeof current.value === "boolean") continue;
    if (typeof current.value === "string") continue;
    if (typeof current.value === "number") {
      if (!Number.isFinite(current.value)) return false;
      continue;
    }
    if (typeof current.value !== "object" || ancestors.has(current.value)) return false;

    ancestors.add(current.value);
    stack.push({ value: null, leaving: current.value });

    if (Array.isArray(current.value)) {
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        if (!(index in current.value)) return false;
        const descriptor = Object.getOwnPropertyDescriptor(current.value, String(index));
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return false;
        stack.push({ value: descriptor.value });
      }
      if (Reflect.ownKeys(current.value).some((key) => key !== "length" && !/^0$|^[1-9]\d*$/.test(String(key)))) return false;
      continue;
    }

    const prototype = Object.getPrototypeOf(current.value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const keys = Reflect.ownKeys(current.value);
    for (const key of keys) {
      if (typeof key !== "string") return false;
      const descriptor = Object.getOwnPropertyDescriptor(current.value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return false;
      stack.push({ value: descriptor.value });
    }
  }

  return true;
}

/** Required arbitrary JSON data; rejects undefined, functions, Date, cycles, and non-finite numbers. */
export const serializableJsonValueSchema = z.custom<SerializableJsonValue>(
  (value) => isSerializableJsonValue(value),
  { message: "Expected a serializable JSON value" },
);

const serializableJsonObjectSchema = serializableJsonValueSchema.refine(
  (value) => value !== null && !Array.isArray(value) && typeof value === "object",
  { message: "Expected a serializable JSON object" },
);
const platformArray = z.array(serializableJsonValueSchema);

export const interactionV1Schema = z.object({
  surface: z.string().trim().min(1).max(80).optional(),
  action: z.string().trim().min(1).max(120).optional(),
  targetRef: z.string().trim().min(1).max(256).optional(),
}).strict();

/** Context sent to an Agentic V2 integration using sanitized snapshots instead of a token. */
const profileSnapshotV1Schema = z.object({
  available: z.boolean(),
  version: z.number().int().nonnegative().nullable(),
  data: serializableJsonValueSchema,
}).strict();

const historySnapshotV1Schema = z.object({
  available: z.boolean(),
  through: z.string().datetime({ offset: true }).nullable(),
  data: serializableJsonValueSchema,
}).strict();

export const simulationStateV1Schema = z.object({
  sessionId: z.string().trim().min(1).max(160),
  scenarioKey: z.string().trim().min(1).max(160),
  status: z.string().trim().min(1).max(80),
  round: z.number().int().nonnegative(),
  transcript: z.array(serializableJsonValueSchema).max(12),
}).strict();

export type ProfileSnapshotV1 = z.infer<typeof profileSnapshotV1Schema>;
export type HistorySnapshotV1 = z.infer<typeof historySnapshotV1Schema>;
export type SimulationStateV1 = z.infer<typeof simulationStateV1Schema>;

export const businessDataV1Schema = z.object({
  schemaVersion: z.literal("1"),
  interaction: interactionV1Schema.optional(),
  profileSnapshot: profileSnapshotV1Schema,
  historySnapshot: historySnapshotV1Schema,
  simulationState: simulationStateV1Schema.nullable(),
  permissions: z.object({
    candidateCreationAllowed: z.literal(true),
    officialWritesAllowed: z.literal(false),
  }).strict(),
}).strict();

export type BusinessDataV1 = z.infer<typeof businessDataV1Schema>;

const marketScopeSchema = z.object({
  region: shortText,
  experienceLevel: shortText,
  timeRange: shortText,
}).strict();

export const evidenceBundleV1Schema = z.object({
  schemaVersion: z.literal("1.0"),
  request: serializableJsonObjectSchema,
  profileSnapshot: z.object({
    available: z.boolean(),
    version: z.number().int().nonnegative().nullable(),
    data: serializableJsonValueSchema,
  }).strict(),
  historySnapshot: z.object({
    available: z.boolean(),
    through: z.string().trim().min(1).max(256).nullable(),
    data: serializableJsonValueSchema,
  }).strict(),
  careerBaseline: z.object({
    roleKey: z.string().trim().min(1).max(160),
    templateVersion: z.string().trim().min(1).max(120),
    evidence: platformArray,
  }).strict(),
  marketEvidence: z.object({
    searched: z.boolean(),
    skipReason: z.string().trim().min(1).max(500).nullable(),
    collectedAt: z.string().datetime({ offset: true }).nullable(),
    scope: marketScopeSchema,
    findings: platformArray,
    sources: platformArray,
    conflicts: platformArray,
    confidence: z.enum(["high", "medium", "low"]),
  }).strict().refine((market) => market.searched || market.skipReason !== null, {
    message: "marketEvidence must be searched or include a skipReason",
  }),
}).strict();

export type EvidenceBundleV1 = z.infer<typeof evidenceBundleV1Schema>;

export const AGENT_ARTIFACT_V1_TASK_TYPES = [
  "profile_assessment",
  "career_exploration",
  "career_plan",
  "learning_route",
  "simulation_turn",
  "simulation_report",
  "resume_review",
  "growth_review",
  "memory_item",
  "career_template_draft",
] as const;

export const AGENT_ARTIFACT_V1_STATUSES = [
  "success",
  "needs_input",
  "pending_confirmation",
  "error",
] as const;

export const agentArtifactV1Schema = z.object({
  schemaVersion: z.literal("1.0"),
  id: z.string().trim().min(1).max(160).optional(),
  taskType: z.enum(AGENT_ARTIFACT_V1_TASK_TYPES),
  status: z.enum(AGENT_ARTIFACT_V1_STATUSES),
  summary: z.string().trim().min(1).max(10_000),
  data: serializableJsonValueSchema,
  evidence: platformArray,
  sources: platformArray,
  assumptions: platformArray,
  warnings: platformArray,
  requiresUserConfirmation: z.boolean(),
  baseVersion: z.number().int().nonnegative().nullable(),
  nextActions: platformArray,
}).strict();

export type AgentArtifactV1 = z.infer<typeof agentArtifactV1Schema>;

// ── 按 taskType / candidateType 区分的精确 Data Schema ──────────
// 候选创建和接受必须复用同一 Schema，不能等用户点击接受时才报 INVALID_CANDIDATE_DATA

/** profile_patch：{ patch: {...} } */
export const profilePatchPayloadSchema = z.object({
  targetRole: z.string().trim().min(1).max(160).nullable().optional(),
  targetRoleLabel: z.string().trim().min(1).max(200).nullable().optional(),
  weeklyAvailableHours: z.number().int().min(1).max(168).nullable().optional(),
  educationStage: z.string().trim().min(1).max(120).nullable().optional(),
  major: z.string().trim().min(1).max(160).nullable().optional(),
  learningPreference: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  experienceSummary: z.string().trim().max(2_000).optional(),
  interestTags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  constraints: z.array(z.string().trim().min(1).max(240)).max(12).optional(),
}).strict().refine(
  (patch) => Object.values(patch).some((value) => value !== undefined),
  { message: "补丁不能为空" },
);

export const profilePatchDataSchema = z.object({
  patch: profilePatchPayloadSchema,
}).strict();

/** ability_evidence：{ abilityEvidence: [...] } */
const confidenceSchema = z.number().min(0).max(1);

/** 六项固定能力键——唯一允许的能力维度 */
export const ALLOWED_ABILITY_KEYS = [
  "aiTooling",
  "roleFoundation",
  "dataAnalysis",
  "businessProduct",
  "communication",
  "projectPractice",
] as const;

const allowedAbilityKeysSet = new Set<string>(ALLOWED_ABILITY_KEYS);

export const abilityEvidenceItemSchema = z.object({
  abilityKey: z.enum(ALLOWED_ABILITY_KEYS),
  summary: z.string().trim().min(1).max(500),
  sourceType: z.string().trim().min(1),
  sourceRef: z.string().trim().optional(),
  confidence: confidenceSchema,
}).strict();

export const abilityEvidenceDataSchema = z.object({
  abilityEvidence: z.array(abilityEvidenceItemSchema).min(1),
}).strict();

/** career_plan：复用 aiCareerPlanV2Schema，确保接受后 Plan V2 UI 正确显示 */
export const careerPlanDataSchema = z.object({
  plan: aiCareerPlanV2Schema,
}).strict();

/** growth_replan：继承 career_plan + planPatch */
export const growthReplanDataSchema = careerPlanDataSchema.extend({
  planPatch: z.object({
    parentPlanId: z.string().trim().min(1).optional(),
    targetRole: z.string().trim().min(1).optional(),
  }).optional(),
});

/** learning_route：可确认学习路线候选——接受后写入独立 LearningRoute 模型 */
export const learningRouteDataSchema = z.object({
  targetRole: z.string().trim().min(1).max(160),
  weeklyBudgetHours: z.number().int().min(1).max(80).optional(),
  period: z.string().trim().min(1).optional(),
  stages: z.array(z.unknown()).optional(),
  tasks: z.array(z.unknown()).optional(),
  resources: z.array(z.unknown()).optional(),
  deliverables: z.array(z.unknown()).optional(),
  acceptanceCriteria: z.array(z.unknown()).optional(),
  adjustmentTriggers: z.array(z.unknown()).optional(),
  /** 生成候选时当前 active LearningRoute 的版本——用于自身版本冲突检测 */
  baseRouteVersion: z.number().int().nonnegative().nullable(),
}).strict();

/** memory_item：长期记忆候选 */
export const memoryItemDataSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  kind: z.string().trim().min(1).max(40),
  reason: z.string().trim().max(500).optional(),
  sensitivity: z.enum(["normal", "sensitive"]).optional(),
}).strict();

/** career_template_draft：岗位模板草稿候选（允许来自 career_exploration 的额外字段） */
export const careerTemplateDraftDataSchema = z.object({
  roleKey: z.string().trim().min(1).max(160),
  roleName: z.string().trim().min(1).max(200),
  category: z.string().trim().max(40).optional(),
  abilityWeights: z.record(z.string(), z.number().min(0).max(1)).optional(),
  reason: z.string().trim().max(500).optional(),
}).passthrough();

/** simulation_turn：模拟单轮（不创建候选但需校验字段） */
export const simulationTurnDataSchema = z.object({
  sessionId: z.string().trim().min(1).max(160),
  scenarioKey: z.string().trim().min(1).max(160),
  round: z.number().int().nonnegative(),
  nextQuestion: z.string().trim().min(1).max(2000),
  isComplete: z.literal(false),
}).strict();

/** career_exploration：职业探索（可附带 career_template_draft 候选字段） */
export const careerExplorationDataSchema = z.object({
  options: z.array(z.object({
    roleName: z.string().trim().min(1).max(200),
    roleKey: z.string().trim().min(1).max(160).optional(),
    fitScore: z.number().min(0).max(100).optional(),
    summary: z.string().trim().max(1000).optional(),
  })).min(1).max(10),
  recommendedOrder: z.array(z.string().trim().min(1).max(160)).optional(),
  risks: z.array(z.string().trim().max(500)).optional(),
  validationExperiments: z.array(z.string().trim().max(500)).optional(),
  // career_template_draft 兼容字段
  roleKey: z.string().trim().min(1).max(160).optional(),
  roleName: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().max(40).optional(),
  abilityWeights: z.record(z.string(), z.number().min(0).max(1)).optional(),
  reason: z.string().trim().max(500).optional(),
}).strict();

/** 按 candidateType 索引的 Data Schema——创建与接受复用 */

/** 单条分数：必须关联证据，不允许无证据评分直接成为正式数据 */
export const scoreEntrySchema = z.object({
  value: z.number().min(0).max(100),
  evidence: z.string().trim().min(1).max(500),
  confidence: z.number().min(0).max(1).optional(),
}).strict();

/** 能力分数映射——键必须是六项固定能力之一，且至少有一条 */
export const abilityScoresRecordSchema = z.record(z.string(), scoreEntrySchema).refine(
  (scores) => Object.keys(scores).length > 0,
  { message: "scores 不能为空对象" },
).refine(
  (scores) => Object.keys(scores).every((k) => allowedAbilityKeysSet.has(k)),
  { message: `分数键必须是: ${ALLOWED_ABILITY_KEYS.join(", ")}` },
);

/** profile_assessment 综合数据：包含画像补丁、能力证据、分数、评估 */
export const profileAssessmentDataSchema = z.object({
  patch: profilePatchPayloadSchema.optional(),
  abilityEvidence: z.array(abilityEvidenceItemSchema).min(1).optional(),
  scores: abilityScoresRecordSchema.optional(),
  strengths: z.array(z.string().trim().max(500)).max(20).optional(),
  gaps: z.array(z.string().trim().max(500)).max(20).optional(),
  missingInformation: z.array(z.string().trim().max(500)).max(20).optional(),
}).strict().refine(
  (data) => {
    // patch 至少有一个非 undefined 字段
    const hasPatch = data.patch !== undefined && Object.values(data.patch).some((v) => v !== undefined);
    // abilityEvidence 非 undefined 且非空（.min(1) 已保证，双保险）
    const hasEvidence = data.abilityEvidence !== undefined && data.abilityEvidence.length > 0;
    // scores 非 undefined 且至少有一个有效条目
    const hasScores = data.scores !== undefined && Object.keys(data.scores).length > 0;
    return hasPatch || hasEvidence || hasScores;
  },
  { message: "profile_assessment 至少需要一个有效 patch 字段、一条 evidence 或一个 score" },
);

export const CANDIDATE_DATA_SCHEMA: Record<string, z.ZodTypeAny> = {
  profile_patch: profilePatchDataSchema,
  profile_assessment: profileAssessmentDataSchema,
  ability_evidence: abilityEvidenceDataSchema,
  career_plan: careerPlanDataSchema,
  growth_replan: growthReplanDataSchema,
  learning_route: learningRouteDataSchema,
  memory_item: memoryItemDataSchema,
  career_template_draft: careerTemplateDraftDataSchema,
};

// ── 按 taskType 区分的 Data Schema（discriminated union） ──────────
// 所有 10 个 taskType 必须有精确 Schema（不再有"无 Schema 不拒绝"的例外）

/** taskType → 对应 data Schema 的映射表 */
export const TASK_TYPE_DATA_SCHEMA: Record<string, z.ZodTypeAny> = {
  profile_assessment: profileAssessmentDataSchema,
  simulation_report: abilityEvidenceDataSchema,
  resume_review: abilityEvidenceDataSchema,
  career_plan: careerPlanDataSchema,
  learning_route: learningRouteDataSchema,
  growth_review: growthReplanDataSchema,
  memory_item: memoryItemDataSchema,
  career_template_draft: careerTemplateDraftDataSchema,
  simulation_turn: simulationTurnDataSchema,
  career_exploration: careerExplorationDataSchema,
};

/** simulation_report 在 success 状态下的报告结果数据格式（由生成代码消费，非候选） */
export const simulationReportSuccessDataSchema = z.object({
  sessionId: z.string().trim().min(1).optional(),
  scenarioKey: z.string().trim().min(1),
  score: z.number().min(0).max(100),
  strengths: z.array(z.string().trim().min(1).max(500)).max(10),
  improvements: z.array(z.string().trim().min(1).max(500)).max(10),
  evidence: z.array(z.string().trim().min(1).max(500)).max(20),
  abilityImpact: z.record(z.string(), z.number()).refine(
    (rec) => Object.keys(rec).every((k) => allowedAbilityKeysSet.has(k)),
    { message: `abilityImpact 键必须是: ${ALLOWED_ABILITY_KEYS.join(", ")}` },
  ),
  candidateUpdates: z.array(z.unknown()).max(20),
  type: z.literal("simulation_report").optional(),
}).strict();

/** needs_input 状态的最小 data 契约 */
export const needsInputDataSchema = z.object({
  question: z.string().trim().min(1).max(2000).optional(),
  missingFields: z.array(z.string().trim().min(1).max(160)).min(1).max(20).optional(),
  context: z.string().trim().max(2000).optional(),
}).strict().refine(
  (d) => d.question || d.missingFields,
  { message: "needs_input 至少需要 question 或 missingFields" },
);

/** error 状态的最小 data 契约 */
export const errorDataSchema = z.object({
  message: z.string().trim().min(1).max(2000).optional(),
  code: z.string().trim().min(1).max(80).optional(),
  recoverable: z.boolean().optional(),
}).strict().refine(
  (d) => d.message || d.code,
  { message: "error 状态至少需要 message 或 code" },
);

/** 按 (taskType, status) 组合覆盖的 data Schema——用于 success/pending_confirmation 可能不同格式的场景 */
const STATUS_AWARE_DATA_SCHEMA: Record<string, Partial<Record<string, z.ZodTypeAny>>> = {
  simulation_report: {
    success: simulationReportSuccessDataSchema,
    pending_confirmation: abilityEvidenceDataSchema,
  },
};

/** 带 data 校验的 AgentArtifactV1（superRefine 按 taskType 做 discriminated union） */
export const validatedAgentArtifactV1Schema = agentArtifactV1Schema.superRefine((artifact, ctx) => {
  const dataSchema = TASK_TYPE_DATA_SCHEMA[artifact.taskType];
  if (!dataSchema) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `未知的 taskType: ${artifact.taskType}`,
      path: ["taskType"],
    });
    return;
  }
  // success / pending_confirmation → 执行对应 taskType 的完整 data Schema
  // 优先使用状态感知 schema（如 simulation_report 在 success 和 pending_confirmation 有不同数据格式）
  if (artifact.status === "success" || artifact.status === "pending_confirmation") {
    // pending_confirmation 必须 requiresUserConfirmation=true
    if (artifact.status === "pending_confirmation" && !artifact.requiresUserConfirmation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "pending_confirmation 状态必须 requiresUserConfirmation=true",
        path: ["requiresUserConfirmation"],
      });
    }
    const statusSchema = STATUS_AWARE_DATA_SCHEMA[artifact.taskType]?.[artifact.status];
    const schema = statusSchema ?? dataSchema;
    const result = schema.safeParse(artifact.data);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ ...issue, path: ["data", ...issue.path] });
      }
    }
    return;
  }
  // needs_input → 最小契约：至少提供 question 或 missingFields
  if (artifact.status === "needs_input") {
    const needsInputResult = needsInputDataSchema.safeParse(artifact.data);
    if (!needsInputResult.success) {
      for (const issue of needsInputResult.error.issues) {
        ctx.addIssue({ ...issue, path: ["data", ...issue.path] });
      }
    }
    return;
  }
  // error → 最小契约：至少提供 message 或 code
  if (artifact.status === "error") {
    const errorResult = errorDataSchema.safeParse(artifact.data);
    if (!errorResult.success) {
      for (const issue of errorResult.error.issues) {
        ctx.addIssue({ ...issue, path: ["data", ...issue.path] });
      }
    }
    return;
  }
});

export const researchReportV1Schema = z.object({
  schemaVersion: z.literal("1.0"),
  topic: shortText,
  collectedAt: z.string().datetime({ offset: true }),
  queryScope: marketScopeSchema,
  findings: platformArray,
  sources: platformArray,
  conflicts: platformArray,
  confidence: z.enum(["high", "medium", "low"]),
  limitations: platformArray,
}).strict();

export type ResearchReportV1 = z.infer<typeof researchReportV1Schema>;

export const REVIEW_REPORT_V1_VERDICTS = ["pass", "revise", "reject"] as const;

export const reviewReportV1Schema = z.object({
  schemaVersion: z.literal("1.0"),
  verdict: z.enum(REVIEW_REPORT_V1_VERDICTS),
  issues: platformArray,
  requiredChanges: platformArray,
  riskFlags: platformArray,
  confirmationRequired: z.boolean(),
}).strict();

export type ReviewReportV1 = z.infer<typeof reviewReportV1Schema>;
