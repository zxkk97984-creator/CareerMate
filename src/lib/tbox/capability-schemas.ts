import { z } from "zod";
import { careerPlanSchema } from "./schemas";

// ── 公共能力维度 ─────────────────────────────────────

export const abilityScoresSchema = z.object({
  aiTooling: z.number().min(0).max(100),
  roleFoundation: z.number().min(0).max(100),
  dataAnalysis: z.number().min(0).max(100),
  businessProduct: z.number().min(0).max(100),
  communication: z.number().min(0).max(100),
  projectPractice: z.number().min(0).max(100),
}).strict();

export const candidateUpdateSchema = z.object({
  field: z.string().trim().min(1).max(100),
  newValue: z.unknown(),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(1).max(500),
  evidenceExcerpt: z.string().trim().min(1).max(2_000),
  impactSummary: z.string().trim().min(1).max(500),
  requiresConfirmation: z.literal(true),
}).strict();

// ── 七类能力结果 Schema ──────────────────────────────

/** 技能评估 */
export const profileAssessmentSchema = z.object({
  type: z.literal("profile_assessment"),
  targetRole: z.string().trim().min(1),
  scores: abilityScoresSchema,
  strengths: z.array(z.string().trim().min(1)).max(10),
  gaps: z.array(z.string().trim().min(1)).max(10),
  evidence: z.array(z.string().trim().min(1)).max(10),
  assumptions: z.array(z.string().trim().min(1)).max(10),
  needsConfirmation: z.literal(true),
  candidateUpdates: z.array(candidateUpdateSchema).max(12).default([]),
}).strict();

/** 三岗位匹配 */
export const roleMatchResultSchema = z.object({
  type: z.literal("role_match"),
  matches: z.array(z.object({
    role: z.string().trim().min(1),
    score: z.number().min(0).max(100),
    reasons: z.array(z.string().trim().min(1)).max(5),
    gaps: z.array(z.string().trim().min(1)).max(5),
    assumptions: z.array(z.string().trim().min(1)).max(5),
  }).strict()).length(3),
}).strict();

/** 职业计划（复用现有 careerPlanSchema） */
// 在 schemas.ts 中已定义 careerPlanSchema，这里做 envelope
/** 职业计划 —— 直接嵌入正式 careerPlanSchema，拒绝空对象和非法结构 */
export const careerPlanResultSchema = z.object({
  type: z.literal("career_plan"),
  plan: careerPlanSchema,
  targetRole: z.string().trim().min(1).max(100).optional(),
  candidateUpdates: z.array(candidateUpdateSchema).max(12).default([]),
}).strict();

/** 学习路线 */
export const learningRouteResultSchema = z.object({
  type: z.literal("learning_route"),
  targetRole: z.string().trim().min(1),
  weeklyHours: z.number().min(1).max(80),
  phases: z.array(z.object({
    name: z.string().trim().min(1),
    weeks: z.number().min(1).max(26),
    weeklyTasks: z.array(z.object({
      task: z.string().trim().min(1),
      resources: z.array(z.string().trim().min(1)).max(5),
      risks: z.array(z.string().trim().min(1)).max(3),
    }).strict()).max(20),
  }).strict()).max(12),
}).strict();

/** 模拟训练单轮 */
export const simulationTurnResultSchema = z.object({
  type: z.literal("simulation_turn"),
  scenarioKey: z.string().trim().min(1),
  assistantMessage: z.string().trim().min(1),
  turnIndex: z.number().min(0).max(10),
  shouldComplete: z.boolean().default(false),
}).strict();

/** 模拟训练报告 */
export const simulationReportResultSchema = z.object({
  type: z.literal("simulation_report"),
  scenarioKey: z.string().trim().min(1),
  score: z.number().min(0).max(100),
  strengths: z.array(z.string().trim().min(1)).max(5),
  improvements: z.array(z.string().trim().min(1)).max(5),
  evidence: z.array(z.string().trim().min(1)).max(10),
  abilityImpact: z.record(z.string(), z.number()),
  candidateUpdates: z.array(candidateUpdateSchema).max(12).default([]),
}).strict();

/** 简历优化 */
export const resumeReviewResultSchema = z.object({
  type: z.literal("resume_review"),
  summary: z.string().trim().min(1).max(2000),
  issues: z.array(z.object({
    severity: z.enum(["high", "medium", "low"]),
    description: z.string().trim().min(1).max(500),
    suggestion: z.string().trim().min(1).max(500),
  }).strict()).max(20),
  suggestions: z.array(z.string().trim().min(1)).max(10),
  rewrites: z.array(z.string().trim().min(1)).max(5),
  fabricatedFacts: z.literal(false),
}).strict();

/** 职业探索报告 */
export const explorationReportResultSchema = z.object({
  type: z.literal("exploration_report"),
  roleName: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(2_000),
  responsibilities: z.array(z.string().trim().min(1)).max(20).default([]),
  coreCompetencies: z.array(z.string().trim().min(1)).max(20).default([]),
  entryPaths: z.array(z.string().trim().min(1)).max(10).default([]),
  marketSignals: z.array(z.string().trim().min(1)).max(10).default([]),
  learningSuggestions: z.array(z.string().trim().min(1)).max(10).default([]),
  fitAnalysis: z.array(z.string().trim().min(1)).max(10).default([]),
  risksAndUncertainties: z.array(z.string().trim().min(1)).max(10).default([]),
  sources: z.array(z.object({
    title: z.string().trim().min(1).max(240),
    organization: z.string().trim().min(1).max(240),
    url: z.string().url().optional(),
    accessedAt: z.string().trim().min(1).max(40).optional(),
    label: z.enum(["已核验职业库", "实时联网调研", "AI分析与推断"]),
  }).strict()).max(20).default([]),
}).strict();

// ── 联合类型 ─────────────────────────────────────────

export const tboxStructuredResultSchema = z.discriminatedUnion("type", [
  profileAssessmentSchema,
  roleMatchResultSchema,
  careerPlanResultSchema,
  learningRouteResultSchema,
  simulationTurnResultSchema,
  simulationReportResultSchema,
  resumeReviewResultSchema,
  explorationReportResultSchema,
]);

export type TboxStructuredResult = z.infer<typeof tboxStructuredResultSchema>;
export type ProfileAssessmentResult = z.infer<typeof profileAssessmentSchema>;
export type RoleMatchResult = z.infer<typeof roleMatchResultSchema>;
export type CareerPlanResult = z.infer<typeof careerPlanResultSchema>;
export type LearningRouteResult = z.infer<typeof learningRouteResultSchema>;
export type SimulationTurnResult = z.infer<typeof simulationTurnResultSchema>;
export type SimulationReportResult = z.infer<typeof simulationReportResultSchema>;
export type ResumeReviewResult = z.infer<typeof resumeReviewResultSchema>;
export type ExplorationReportResult = z.infer<typeof explorationReportResultSchema>;
