import { z } from "zod";

const taskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(["learn", "practice", "review", "simulation"]),
  status: z.enum(["not_started", "in_progress", "done", "delayed"]),
  dueWeek: z.number().int().min(1).max(5).optional(),
});

const stringList = (min: number) =>
  z.preprocess(
    (value) => {
      if (typeof value === "string" && value.trim().length > 0) return [value.trim()];
      return value;
    },
    z.array(z.string().min(1)).min(min),
  );

const TASK_TYPE_ALIASES: Record<string, string> = {
  course: "learn",
  reading: "learn",
  study: "learn",
  exercise: "practice",
  "hands-on": "practice",
  review: "review",
  simulation: "simulation",
};

const TASK_STATUS_ALIASES: Record<string, string> = {
  todo: "not_started",
  pending: "not_started",
  doing: "in_progress",
  "in progress": "in_progress",
  completed: "done",
  finished: "done",
  overdue: "delayed",
};

function normalizeTaskType(value: string): string {
  return TASK_TYPE_ALIASES[value.trim().toLowerCase()] ?? value;
}

function normalizeTaskStatus(value: string): string {
  return TASK_STATUS_ALIASES[value.trim().toLowerCase()] ?? value;
}

const learningTasksArray = z.preprocess(
  (value) => {
    if (!Array.isArray(value)) return value;
    return value.map((task, index) => {
      if (typeof task !== "object" || task === null) return task;
      const t = task as Record<string, unknown>;
      const normalized: Record<string, unknown> = { ...t };
      if (typeof t.id !== "string" || t.id.trim() === "") {
        normalized.id = `task-${index + 1}`;
      }
      if (typeof t.type === "string") normalized.type = normalizeTaskType(t.type);
      if (typeof t.status === "string") normalized.status = normalizeTaskStatus(t.status);
      return normalized;
    });
  },
  z.array(taskSchema).min(1),
);

const monthSchema = z.object({
  monthIndex: z.number().int().min(1).max(36),
  goal: z.string().min(1),
  learningTasks: learningTasksArray,
  practiceOutputs: stringList(1),
  evaluationMetrics: stringList(1),
});

function exactSequence(
  values: number[],
  expectedLength: number,
  ctx: z.RefinementCtx,
  path: string,
) {
  const valid = values.every((value, index) => value === index + 1);
  if (!valid || values.length !== expectedLength) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${path} must be the ordered sequence 1..${expectedLength}`,
      path: [path],
    });
  }
}

export const careerPlanSchema = z
  .object({
    years: z
      .array(
        z.object({
          yearIndex: z.number().int().min(1).max(3),
          goal: z.string().min(1),
          expectedOutputs: z.array(z.string().min(1)).min(1),
        }),
      )
      .length(3),
    quarters: z
      .array(
        z.object({
          quarterIndex: z.number().int().min(1).max(12),
          goal: z.string().min(1),
          milestone: z.string().min(1),
          evaluation: z.string().min(1),
        }),
      )
      .length(12),
    months: z.array(monthSchema).length(36),
    currentMonth: monthSchema.optional(),
    assumptions: z.array(z.string().min(1)),
    riskNotes: z.array(z.string().min(1)),
  })
  .superRefine((plan, ctx) => {
    exactSequence(plan.years.map((item) => item.yearIndex), 3, ctx, "years");
    exactSequence(plan.quarters.map((item) => item.quarterIndex), 12, ctx, "quarters");
    exactSequence(plan.months.map((item) => item.monthIndex), 36, ctx, "months");
  })
  .transform((plan) => ({ ...plan, currentMonth: plan.currentMonth ?? plan.months[0]! }));

export type CareerPlan = z.infer<typeof careerPlanSchema>;

export const yearPlanChunkSchema = z
  .object({
    year: z.object({
      yearIndex: z.number().int().min(1).max(3),
      goal: z.string().min(1),
      expectedOutputs: z.array(z.string().min(1)).min(1),
    }),
    quarters: z
      .array(
        z.object({
          quarterIndex: z.number().int().min(1).max(12),
          goal: z.string().min(1),
          milestone: z.string().min(1),
          evaluation: z.string().min(1),
        }),
      )
      .length(4),
    months: z.array(monthSchema).length(12),
    assumptions: z.array(z.string().min(1)),
    riskNotes: z.array(z.string().min(1)),
  })
  .superRefine((chunk, ctx) => {
    const n = chunk.year.yearIndex;
    const qStart = (n - 1) * 4 + 1;
    const mStart = (n - 1) * 12 + 1;
    if (!chunk.quarters.every((quarter, index) => quarter.quarterIndex === qStart + index)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `quarters must be the ordered sequence ${qStart}..${qStart + 3}`,
        path: ["quarters"],
      });
    }
    if (!chunk.months.every((month, index) => month.monthIndex === mStart + index)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `months must be the ordered sequence ${mStart}..${mStart + 11}`,
        path: ["months"],
      });
    }
  });

export type YearPlanChunk = z.infer<typeof yearPlanChunkSchema>;

export const chatInputSchema = z.object({
  question: z.string().trim().min(1).max(8_000),
  conversationId: z.string().trim().min(1).max(256).optional(),
  context: z.record(z.unknown()).optional(),
});

// ── 工作流与知识库配置 schema ──────────────────────────

export const workflowTypeSchema = z.enum([
  "career_exploration",
  "profile_candidate",
  "role_research",
  "plan_generation",
  "simulation_training",
]);

export const workflowConfigSchema = z.object({
  type: workflowTypeSchema,
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  knowledgeBases: z.array(z.enum([
    "roleCompetency",
    "learningResources",
    "simulationScenes",
    "ethicsRules",
  ])),
  allowDegradation: z.boolean(),
  outputSchema: z.string().min(1).max(120),
});

export const knowledgeBaseConfigSchema = z.object({
  key: z.enum(["roleCompetency", "learningResources", "simulationScenes", "ethicsRules"]),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  sourceDescription: z.string().min(1).max(500),
  lastUpdated: z.string(),
});
