import { z } from "zod";

const shortText = z.string().trim().min(1).max(500);
const platformValue = z.unknown();
const platformArray = z.array(platformValue).max(100);

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
  request: z.record(z.string().min(1).max(120), platformValue),
  profileSnapshot: z.object({
    available: z.boolean(),
    version: z.number().int().nonnegative().nullable(),
    data: platformValue,
  }).strict(),
  historySnapshot: z.object({
    available: z.boolean(),
    through: z.string().trim().min(1).max(256).nullable(),
    data: platformValue,
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
  data: platformValue,
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
