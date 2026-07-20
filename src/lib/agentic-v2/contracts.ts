import { z } from "zod";

const shortText = z.string().trim().min(1).max(500);
const MAX_JSON_DEPTH = 12;
const MAX_JSON_NODES = 1_000;
const MAX_JSON_STRING_LENGTH = 10_000;
const MAX_JSON_ARRAY_LENGTH = 100;
const MAX_JSON_OBJECT_PROPERTIES = 100;
const MAX_JSON_OBJECT_KEY_LENGTH = 120;

export type SerializableJsonValue =
  | null
  | boolean
  | number
  | string
  | SerializableJsonValue[]
  | { [key: string]: SerializableJsonValue };

function isSerializableJsonValue(value: unknown): value is SerializableJsonValue {
  const ancestors = new Set<object>();
  const stack: Array<{ value: unknown; depth: number; leaving?: object }> = [{ value, depth: 0 }];
  let nodeCount = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) return false;
    if (current.leaving) {
      ancestors.delete(current.leaving);
      continue;
    }

    nodeCount += 1;
    if (nodeCount > MAX_JSON_NODES || current.depth > MAX_JSON_DEPTH) return false;
    if (current.value === null || typeof current.value === "boolean") continue;
    if (typeof current.value === "string") {
      if (current.value.length > MAX_JSON_STRING_LENGTH) return false;
      continue;
    }
    if (typeof current.value === "number") {
      if (!Number.isFinite(current.value)) return false;
      continue;
    }
    if (typeof current.value !== "object" || ancestors.has(current.value)) return false;

    ancestors.add(current.value);
    stack.push({ value: null, depth: current.depth, leaving: current.value });

    if (Array.isArray(current.value)) {
      if (current.value.length > MAX_JSON_ARRAY_LENGTH) return false;
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        if (!(index in current.value)) return false;
        const descriptor = Object.getOwnPropertyDescriptor(current.value, String(index));
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return false;
        stack.push({ value: descriptor.value, depth: current.depth + 1 });
      }
      if (Reflect.ownKeys(current.value).some((key) => key !== "length" && !/^0$|^[1-9]\d*$/.test(String(key)))) return false;
      continue;
    }

    const prototype = Object.getPrototypeOf(current.value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const keys = Reflect.ownKeys(current.value);
    if (keys.length > MAX_JSON_OBJECT_PROPERTIES) return false;
    for (const key of keys) {
      if (typeof key !== "string" || key.length > MAX_JSON_OBJECT_KEY_LENGTH) return false;
      const descriptor = Object.getOwnPropertyDescriptor(current.value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return false;
      stack.push({ value: descriptor.value, depth: current.depth + 1 });
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
const platformArray = z.array(serializableJsonValueSchema).max(MAX_JSON_ARRAY_LENGTH);

export const interactionV1Schema = z.object({
  surface: z.string().trim().min(1).max(80).optional(),
  action: z.string().trim().min(1).max(120).optional(),
  targetRef: z.string().trim().min(1).max(256).optional(),
}).strict();

/** Context sent to an Agentic V2 integration. It deliberately contains no profile payload. */
export const businessDataV1Schema = z.object({
  schemaVersion: z.literal("1"),
  careermate_context_token: z.string().trim().min(1).max(4096),
  interaction: interactionV1Schema.optional(),
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
}).strict().superRefine((bundle, ctx) => {
  const invalid = (path: (string | number)[], message: string) => ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message,
  });

  if (bundle.profileSnapshot.available) {
    if (bundle.profileSnapshot.version === null || bundle.profileSnapshot.data === null) {
      invalid(["profileSnapshot"], "An available profileSnapshot requires version and data");
    }
  } else if (bundle.profileSnapshot.version !== null || bundle.profileSnapshot.data !== null) {
    invalid(["profileSnapshot"], "An unavailable profileSnapshot must use null version and data");
  }

  if (bundle.historySnapshot.available) {
    if (bundle.historySnapshot.through === null || bundle.historySnapshot.data === null) {
      invalid(["historySnapshot"], "An available historySnapshot requires through and data");
    }
  } else if (bundle.historySnapshot.through !== null || bundle.historySnapshot.data !== null) {
    invalid(["historySnapshot"], "An unavailable historySnapshot must use null through and data");
  }

  if (bundle.marketEvidence.searched) {
    if (bundle.marketEvidence.collectedAt === null || bundle.marketEvidence.skipReason !== null) {
      invalid(["marketEvidence"], "Searched marketEvidence requires collectedAt and no skipReason");
    }
  } else if (bundle.marketEvidence.collectedAt !== null || bundle.marketEvidence.skipReason === null) {
    invalid(["marketEvidence"], "Skipped marketEvidence requires skipReason and no collectedAt");
  }
});

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
