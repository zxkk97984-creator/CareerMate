import { z } from "zod";

// ── PlanDuration ─────────────────────────────────

export const planDurationSchema = z.object({
  value: z.number().int().min(1),
  unit: z.enum(["day", "week", "month", "year"]),
}).strict();

export type PlanDuration = z.infer<typeof planDurationSchema>;

// ── PlanActionV2 ─────────────────────────────────

export const planActionV2Schema = z.object({
  id: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000),
  type: z.enum(["learning", "practice", "project", "review", "application"]),
  status: z.enum(["not_started", "in_progress", "done", "delayed"]),
  estimatedHours: z.number().int().min(0).optional(),
  cadence: z.string().trim().max(200).optional(),
  resources: z.array(z.string().trim().max(500)).max(20),
}).strict();

export type PlanActionV2 = z.infer<typeof planActionV2Schema>;

// ── PlanPhaseV2 ──────────────────────────────────

export const planPhaseV2Schema = z.object({
  id: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(200),
  objective: z.string().trim().max(2000),
  duration: planDurationSchema,
  skills: z.array(z.string().trim().min(1).max(200)).max(20),
  actions: z.array(planActionV2Schema).min(1).max(20),
  outputs: z.array(z.string().trim().max(500)).max(20),
  evaluationCriteria: z.array(z.string().trim().max(500)).max(20),
  risks: z.array(z.string().trim().max(500)).max(20),
}).strict();

export type PlanPhaseV2 = z.infer<typeof planPhaseV2Schema>;

// ── AiCareerPlanV2 ───────────────────────────────

export const aiCareerPlanV2Schema = z.object({
  schemaVersion: z.literal(2),
  title: z.string().trim().min(1).max(200),
  targetRole: z.object({
    key: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(160),
  }).strict(),
  summary: z.string().trim().max(2000),
  horizon: planDurationSchema,
  phases: z.array(planPhaseV2Schema).min(1).max(8),
  immediateActions: z.array(planActionV2Schema).max(8),
  assumptions: z.array(z.string().trim().max(500)).max(20),
  riskNotes: z.array(z.string().trim().max(500)).max(20),
  evidenceRefs: z.array(z.string().trim().max(500)).max(30),
}).strict().refine(
  (plan) => {
    // 全局 action ID 唯一性检查（phases 内 + immediateActions）
    const ids = new Set<string>();
    for (const phase of plan.phases) {
      for (const action of phase.actions) {
        if (ids.has(action.id)) return false;
        ids.add(action.id);
      }
    }
    for (const action of plan.immediateActions) {
      if (ids.has(action.id)) return false;
      ids.add(action.id);
    }
    return true;
  },
  { message: "action ID 必须全局唯一" },
);

export type AiCareerPlanV2 = z.infer<typeof aiCareerPlanV2Schema>;
