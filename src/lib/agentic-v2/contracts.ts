import { z } from "zod";

const schemaVersionV1 = z.literal("1");
const shortText = z.string().trim().min(1).max(500);

export const interactionV1Schema = z.object({
  surface: z.string().trim().min(1).max(80).optional(),
  action: z.string().trim().min(1).max(120).optional(),
  targetRef: z.string().trim().min(1).max(256).optional(),
}).strict();

/** Context sent to an Agentic V2 integration. It deliberately contains no profile payload. */
export const businessDataV1Schema = z.object({
  schemaVersion: schemaVersionV1,
  careermate_context_token: z.string().trim().min(1).max(4096),
  interaction: interactionV1Schema.optional(),
}).strict();

export type BusinessDataV1 = z.infer<typeof businessDataV1Schema>;

export const evidenceItemV1Schema = z.object({
  id: z.string().trim().min(1).max(160).optional(),
  content: z.string().trim().min(1).max(10_000).optional(),
  sourceRef: z.string().trim().min(1).max(500).optional(),
}).strict();

const evidenceRouteV1Schema = z.object({
  facts: z.array(evidenceItemV1Schema).max(100).optional(),
  entries: z.array(evidenceItemV1Schema).max(100).optional(),
  items: z.array(evidenceItemV1Schema).max(100).optional(),
}).strict();

export const evidenceBundleV1Schema = z.object({
  schemaVersion: schemaVersionV1,
  profile: evidenceRouteV1Schema,
  history: evidenceRouteV1Schema,
  resources: evidenceRouteV1Schema,
  market: z.object({
    searched: z.boolean(),
    skipReason: z.string().trim().min(1).max(500).optional(),
    items: z.array(evidenceItemV1Schema).max(100).optional(),
  }).strict().refine((market) => market.searched || Boolean(market.skipReason), {
    message: "market must be searched or include a skipReason",
  }),
}).strict();

export type EvidenceBundleV1 = z.infer<typeof evidenceBundleV1Schema>;

export const AGENT_ARTIFACT_V1_TASK_TYPES = [
  "research",
  "profile_candidate",
  "career_plan",
  "simulation",
  "resource_recommendation",
  "review",
] as const;

export const AGENT_ARTIFACT_V1_STATUSES = [
  "draft",
  "ready_for_review",
  "awaiting_confirmation",
  "approved",
  "rejected",
  "completed",
] as const;

export const nextActionV1Schema = z.object({
  label: shortText,
  action: z.string().trim().min(1).max(120),
  targetRef: z.string().trim().min(1).max(256).optional(),
}).strict();

export const agentArtifactV1Schema = z.object({
  schemaVersion: schemaVersionV1,
  id: z.string().trim().min(1).max(160),
  title: shortText,
  summary: z.string().trim().max(5_000).optional(),
  taskType: z.enum(AGENT_ARTIFACT_V1_TASK_TYPES),
  status: z.enum(AGENT_ARTIFACT_V1_STATUSES),
  requiresUserConfirmation: z.boolean(),
  baseVersion: z.number().int().nonnegative(),
  nextActions: z.array(nextActionV1Schema).max(20),
  payload: z.record(z.string().max(120), z.unknown()).optional(),
}).strict();

export type AgentArtifactV1 = z.infer<typeof agentArtifactV1Schema>;

export const researchReportV1Schema = z.object({
  schemaVersion: schemaVersionV1,
  title: shortText,
  summary: z.string().trim().min(1).max(10_000),
  findings: z.array(z.object({
    claim: z.string().trim().min(1).max(2_000),
    evidenceRefs: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  }).strict()).max(100),
  evidence: evidenceBundleV1Schema,
}).strict();

export type ResearchReportV1 = z.infer<typeof researchReportV1Schema>;

export const REVIEW_REPORT_V1_STATUSES = ["approved", "changes_requested", "rejected"] as const;

export const reviewReportV1Schema = z.object({
  schemaVersion: schemaVersionV1,
  artifactId: z.string().trim().min(1).max(160),
  status: z.enum(REVIEW_REPORT_V1_STATUSES),
  summary: z.string().trim().min(1).max(5_000),
  issues: z.array(z.object({
    code: z.string().trim().min(1).max(120).optional(),
    message: z.string().trim().min(1).max(2_000),
    severity: z.enum(["info", "warning", "error"]).optional(),
  }).strict()).max(100),
}).strict();

export type ReviewReportV1 = z.infer<typeof reviewReportV1Schema>;
