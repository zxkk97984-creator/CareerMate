import { z } from "zod";

const taskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(["learn", "practice"]),
  status: z.enum(["not_started", "in_progress", "done"]),
  dueWeek: z.number().int().min(1).max(5),
});

const monthSchema = z.object({
  monthIndex: z.number().int().min(1).max(36),
  goal: z.string().min(1),
  learningTasks: z.array(taskSchema).min(1),
  practiceOutputs: z.array(z.string().min(1)).min(1),
  evaluationMetrics: z.array(z.string().min(1)).min(1),
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

export const chatInputSchema = z.object({
  question: z.string().trim().min(1).max(8_000),
  conversationId: z.string().trim().min(1).max(256).optional(),
  context: z.record(z.unknown()).optional(),
});
