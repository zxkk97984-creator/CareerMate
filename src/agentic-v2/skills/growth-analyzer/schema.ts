import { z } from "zod";

// ---- 输入类型 ----

export const abilityScoreSchema = z.object({
  abilityKey: z.string().min(1).max(120),
  score: z.number().min(0).max(100),
  observedAt: z.string().datetime({ offset: true }),
});

export const planSummarySchema = z.object({
  id: z.string().min(1).max(64),
  targetRole: z.string().min(1).max(120).optional(),
  targetRoleLabel: z.string().nullable().optional(),
  status: z.string().min(1).max(20),
  currentMonthIndex: z.number().int().nonnegative().optional(),
  version: z.number().int().nonnegative().optional(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const progressEventSchema = z.object({
  id: z.string().min(1).max(64),
  eventType: z.string().min(1).max(40),
  title: z.string().min(1).max(500).optional(),
  summary: z.string().max(2000).optional(),
  createdAt: z.string().datetime({ offset: true }),
});

export const simulationSummarySchema = z.object({
  id: z.string().min(1).max(64),
  scenarioKey: z.string().min(1).max(120),
  scenarioTitle: z.string().max(200).optional(),
  score: z.number().min(0).max(100).nullable(),
  feedback: z.unknown().optional(),
  status: z.string().min(1).max(20),
  turnCount: z.number().int().nonnegative().optional(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }).optional(),
});

export const profileSnapshotSchema = z.object({
  available: z.boolean(),
  data: z
    .object({
      abilityScores: z.record(z.string(), z.number()).optional(),
      targetRole: z.string().optional(),
      targetRoleLabel: z.string().optional(),
    })
    .optional(),
});

export const analyzerInputSchema = z.object({
  profileSnapshot: profileSnapshotSchema.optional(),
  planHistory: z.array(planSummarySchema).optional().default([]),
  progressLogs: z.array(progressEventSchema).optional().default([]),
  simulations: z.array(simulationSummarySchema).optional().default([]),
  historicalScores: z.array(abilityScoreSchema).optional().default([]),
});

export type AnalyzerInput = z.infer<typeof analyzerInputSchema>;

// ---- 输出类型 ----

export const abilityChangeSchema = z.object({
  abilityKey: z.string(),
  initialScore: z.number(),
  currentScore: z.number(),
  delta: z.number(),
  direction: z.enum(["up", "down", "stable"]),
  dataPoints: z.number().int().nonnegative(),
});

export const simulationProgressSchema = z.object({
  scenarioKey: z.string(),
  bestScore: z.number().nullable(),
  attempts: z.number().int().nonnegative(),
  trend: z.enum(["improving", "declining", "stable", "insufficient_data"]),
});

export const trendsSchema = z.object({
  abilityChanges: z.array(abilityChangeSchema),
  planCompletionRate: z.number().min(0).max(1),
  totalCompletedPlans: z.number().int().nonnegative(),
  totalActivePlans: z.number().int().nonnegative(),
  simulationProgress: z.array(simulationProgressSchema),
  continuousTrainingDays: z.number().int().nonnegative(),
  totalProgressEvents: z.number().int().nonnegative(),
  weaknesses: z.array(z.string()),
});

export const summarySchema = z.object({
  overallDirection: z.enum(["improving", "stable", "declining", "insufficient_data"]),
  strongAreas: z.array(z.string()),
  weakAreas: z.array(z.string()),
  consistencyScore: z.number().min(0).max(1),
});

export const growthAnalysisSchema = z.object({
  schemaVersion: z.literal("1.0"),
  analyzedAt: z.string().datetime({ offset: true }),
  trends: trendsSchema,
  summary: summarySchema,
});

export type GrowthAnalysis = z.infer<typeof growthAnalysisSchema>;
