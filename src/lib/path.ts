import { z } from "zod";
import { taskStatuses, type PlanMonth, type TaskStatus } from "./types";

const planTaskSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1),
  type: z.string().min(1),
  status: z.enum(taskStatuses),
  dueWeek: z.number().int().min(1).max(5).optional(),
}).passthrough();

const planMonthSchema = z.object({
  monthIndex: z.number().int().min(1).max(36),
  goal: z.string(),
  learningTasks: z.array(planTaskSchema),
  practiceOutputs: z.array(z.string()),
  evaluationMetrics: z.array(z.string()),
}).passthrough();

export const planMonthsSchema = z.array(planMonthSchema).length(36);

type TimelineItem = Record<string, unknown>;

export function groupPlanTimeline(input: {
  years: TimelineItem[];
  quarters: TimelineItem[];
  months: TimelineItem[];
}) {
  return input.years.map((year, index) => ({
    year,
    quarters: input.quarters.slice(index * 4, index * 4 + 4),
    months: input.months.slice(index * 12, index * 12 + 12),
  }));
}

export type TaskUpdateResult =
  | { kind: "invalid"; reason: string }
  | { kind: "missing" }
  | { kind: "unchanged"; months: PlanMonth[]; previousStatus: TaskStatus }
  | { kind: "updated"; months: PlanMonth[]; previousStatus: TaskStatus };

export function updatePlanTaskStatus(serializedMonths: string, taskId: string, status: TaskStatus): TaskUpdateResult {
  let raw: unknown;
  try {
    raw = JSON.parse(serializedMonths);
  } catch {
    return { kind: "invalid", reason: "months_json" };
  }
  const parsed = planMonthsSchema.safeParse(raw);
  if (!parsed.success) return { kind: "invalid", reason: "months_structure" };

  const matches = parsed.data.flatMap((month) =>
    month.learningTasks.filter((task) => task.id === taskId).map((task) => ({ month, task })),
  );
  if (matches.length === 0) return { kind: "missing" };
  if (matches.length !== 1) return { kind: "invalid", reason: "duplicate_task_id" };

  const previousStatus = matches[0].task.status;
  const months = parsed.data as PlanMonth[];
  if (previousStatus === status) return { kind: "unchanged", months, previousStatus };
  matches[0].task.status = status;
  return { kind: "updated", months, previousStatus };
}
