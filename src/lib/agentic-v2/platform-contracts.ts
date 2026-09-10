import { z } from "zod";
import { serializableJsonValueSchema } from "./contracts";
import { jobSampleContextSchema } from "@/lib/jobs/context";

const shortText = z.string().trim().min(1).max(500);
const nullableShortText = shortText.nullable();

export const platformTaskTypes = [
  "general_chat",
  "profile_assessment",
  "career_exploration",
  "career_plan",
  "learning_route",
  "simulation_turn",
  "simulation_report",
  "simulation_scenario",
  "growth_review",
  "resume_review",
] as const;

export const platformTaskContextV1Schema = z.object({
  schemaVersion: z.literal("1.0"),
  taskType: z.enum(platformTaskTypes),
  currentTime: z.string().datetime({ offset: true }),
  timezone: z.string().trim().min(1).max(80),
  profileVersion: z.number().int().nonnegative().nullable(),
  activePlanId: z.string().trim().min(1).max(160).nullable(),
  basePlanVersion: z.number().int().nonnegative().nullable(),
  activeLearningRouteKnown: z.boolean(),
  baseRouteVersion: z.number().int().nonnegative().nullable(),
  weeklyBudgetHours: z.number().int().min(1).max(168).nullable(),
  requestedPeriod: z.string().trim().max(120).nullable(),
  simulationState: z.object({
    sessionId: z.string().trim().min(1).max(160),
    scenarioKey: z.string().trim().min(1).max(160),
    round: z.number().int().nonnegative(),
    expectedRound: z.number().int().nonnegative().nullable(),
  }).strict().nullable(),
  expectedRound: z.number().int().nonnegative().nullable(),
  sourceType: z.enum(["recommended", "custom", "job"]).nullable().optional(),
  sourceRef: z.string().trim().max(200).nullable().optional(),
  purpose: z.enum(["interactive_artifact", "read_only_report", "simulation"]),
  source: z.enum(["chat", "career_path", "simulation", "resource_center", "job_sample"]),
}).strict();

export type PlatformTaskContextV1 = z.infer<typeof platformTaskContextV1Schema>;

export const platformEvidenceBundleV1Schema = z.object({
  schemaVersion: z.literal("1.0"),
  request: serializableJsonValueSchema,
  profileSnapshot: z.object({
    available: z.boolean(),
    version: z.number().int().nonnegative().nullable(),
    data: serializableJsonValueSchema,
  }).strict(),
  historySnapshot: z.object({
    available: z.boolean(),
    through: z.string().trim().max(256).nullable(),
    data: serializableJsonValueSchema,
  }).strict(),
  careerBaseline: z.object({
    available: z.boolean(),
    roleKey: nullableShortText,
    templateVersion: nullableShortText,
    evidence: z.array(serializableJsonValueSchema).max(50),
  }).strict().refine(
    (baseline) => !baseline.available || Boolean(baseline.roleKey && baseline.templateVersion),
    { message: "available careerBaseline must include roleKey and templateVersion" },
  ),
  marketEvidence: z.object({
    searched: z.boolean(),
    skipReason: z.string().trim().max(500).nullable(),
    collectedAt: z.string().datetime({ offset: true }).nullable(),
    scope: z.object({
      region: shortText,
      experienceLevel: shortText,
      timeRange: shortText,
    }).strict(),
    findings: z.array(serializableJsonValueSchema).max(50),
    sources: z.array(serializableJsonValueSchema).max(50),
    conflicts: z.array(serializableJsonValueSchema).max(50),
    confidence: z.enum(["high", "medium", "low"]),
  }).strict().refine(
    (market) => market.searched || market.skipReason !== null,
    { message: "marketEvidence must be searched or include a skipReason" },
  ),
  userMaterial: z.object({
    available: z.boolean(),
    materialId: z.string().trim().max(160).nullable(),
    text: z.string().max(20_000).nullable(),
  }).strict().optional(),
  verifiedAnalysis: z.object({
    available: z.boolean(),
    algorithmVersion: z.string().trim().max(80).nullable(),
    data: serializableJsonValueSchema,
  }).strict().optional(),
  jobSample: jobSampleContextSchema.nullable().optional(),
}).strict();

export type PlatformEvidenceBundleV1 = z.infer<typeof platformEvidenceBundleV1Schema>;

export interface BuildPlatformContractsInput {
  taskType: PlatformTaskContextV1["taskType"];
  currentTime: string;
  timezone: string;
  profileVersion: number | null;
  activePlanId: string | null;
  basePlanVersion: number | null;
  activeLearningRouteKnown: boolean;
  baseRouteVersion: number | null;
  weeklyBudgetHours: number | null;
  requestedPeriod: string | null;
  simulationState: PlatformTaskContextV1["simulationState"];
  expectedRound: number | null;
  sourceType?: PlatformTaskContextV1["sourceType"];
  sourceRef?: PlatformTaskContextV1["sourceRef"];
  purpose: PlatformTaskContextV1["purpose"];
  source: PlatformTaskContextV1["source"];
  profileSnapshot: PlatformEvidenceBundleV1["profileSnapshot"];
  historySnapshot: PlatformEvidenceBundleV1["historySnapshot"];
  careerBaseline: PlatformEvidenceBundleV1["careerBaseline"];
  marketEvidence: PlatformEvidenceBundleV1["marketEvidence"];
  userMaterial?: PlatformEvidenceBundleV1["userMaterial"];
  verifiedAnalysis?: PlatformEvidenceBundleV1["verifiedAnalysis"];
  jobSample?: PlatformEvidenceBundleV1["jobSample"];
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

export function buildPlatformContracts(input: BuildPlatformContractsInput) {
  const taskContext = platformTaskContextV1Schema.parse(withoutUndefined({
    schemaVersion: "1.0",
    taskType: input.taskType,
    currentTime: input.currentTime,
    timezone: input.timezone,
    profileVersion: input.profileVersion,
    activePlanId: input.activePlanId,
    basePlanVersion: input.basePlanVersion,
    activeLearningRouteKnown: input.activeLearningRouteKnown,
    baseRouteVersion: input.baseRouteVersion,
    weeklyBudgetHours: input.weeklyBudgetHours,
    requestedPeriod: input.requestedPeriod,
    simulationState: input.simulationState,
    expectedRound: input.expectedRound,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    purpose: input.purpose,
    source: input.source,
  }));
  const evidenceBundle = platformEvidenceBundleV1Schema.parse(withoutUndefined({
    schemaVersion: "1.0",
    request: {
      taskType: input.taskType,
      purpose: input.purpose,
    },
    profileSnapshot: input.profileSnapshot,
    historySnapshot: input.historySnapshot,
    careerBaseline: input.careerBaseline,
    marketEvidence: input.marketEvidence,
    userMaterial: input.userMaterial,
    verifiedAnalysis: input.verifiedAnalysis,
    jobSample: input.jobSample,
  }));
  return { taskContext, evidenceBundle };
}

export function buildPlatformContractExample(taskType: PlatformTaskContextV1["taskType"] = "learning_route") {
  const contracts = buildPlatformContracts({
    taskType,
    currentTime: "2026-09-09T08:00:00+08:00",
    timezone: "Asia/Shanghai",
    profileVersion: 3,
    activePlanId: "plan-demo",
    basePlanVersion: 2,
    activeLearningRouteKnown: true,
    baseRouteVersion: null,
    weeklyBudgetHours: 6,
    requestedPeriod: "4周",
    simulationState: null,
    expectedRound: null,
    purpose: "interactive_artifact",
    source: "chat",
    profileSnapshot: {
      available: true,
      version: 3,
      data: { targetRole: "data_analyst", weeklyAvailableHours: 6 },
    },
    historySnapshot: {
      available: true,
      through: "2026-09-09T08:00:00+08:00",
      data: { activePlan: { id: "plan-demo", version: 2 } },
    },
    careerBaseline: {
      available: true,
      roleKey: "data_analyst",
      templateVersion: "2026.09",
      evidence: [],
    },
    marketEvidence: {
      searched: false,
      skipReason: "学习路线使用本地资源库，不需要实时市场搜索",
      collectedAt: null,
      scope: { region: "全国", experienceLevel: "entry", timeRange: "2026-Q3" },
      findings: [],
      sources: [],
      conflicts: [],
      confidence: "low",
    },
  });
  return {
    request: `为 ${taskType} 任务生成结构化结果`,
    task_context_json: JSON.stringify(contracts.taskContext, null, 2),
    evidence_bundle_json: JSON.stringify(contracts.evidenceBundle, null, 2),
  };
}
