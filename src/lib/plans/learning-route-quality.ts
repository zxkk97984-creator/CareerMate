import { z } from "zod";

const learningRouteTaskSchema = z.object({
  title: z.string().trim().min(4),
  description: z.string().trim().min(8),
  estimatedHours: z.number().finite().positive(),
  outputs: z.array(z.string().trim().min(1)).min(1),
  acceptanceCriteria: z.array(z.string().trim().min(1)).min(1),
}).passthrough();

const learningRouteStageSchema = z.object({
  title: z.string().trim().min(2),
  description: z.string().trim().optional(),
  tasks: z.array(learningRouteTaskSchema).min(1),
}).passthrough();

export const learningRouteDataSchema = z.object({
  targetRole: z.string().trim().min(1).max(160),
  weeklyBudgetHours: z.number().int().min(1).max(80),
  period: z.string().trim().min(1).max(120),
  stages: z.array(learningRouteStageSchema).min(1),
  tasks: z.array(learningRouteTaskSchema).optional().default([]),
  resources: z.array(z.unknown()).optional(),
  deliverables: z.array(z.unknown()).optional(),
  acceptanceCriteria: z.array(z.unknown()).optional(),
  adjustmentTriggers: z.array(z.unknown()).optional(),
  baseRouteVersion: z.number().int().nonnegative().nullable(),
}).strict();

export type LearningRouteData = z.infer<typeof learningRouteDataSchema>;

export interface LearningRouteQualityIssue {
  code: "MISSING_TASKS" | "INVALID_PERIOD" | "WEEKLY_BUDGET_EXCEEDED";
  message: string;
}

export class LearningRouteQualityError extends Error {
  constructor(public readonly issues: LearningRouteQualityIssue[]) {
    super(issues.map((issue) => issue.message).join("；"));
    this.name = "LearningRouteQualityError";
  }
}

function periodToWeeks(period: string): number | null {
  const normalized = period.trim();
  const week = normalized.match(/(\d+(?:\.\d+)?)\s*周/);
  if (week) return Number(week[1]);
  const month = normalized.match(/(\d+(?:\.\d+)?)\s*个?月/);
  if (month) return Number(month[1]) * 4;
  const day = normalized.match(/(\d+(?:\.\d+)?)\s*天/);
  if (day) return Number(day[1]) / 7;
  return null;
}

export function assessLearningRouteDataQuality(input: unknown): LearningRouteQualityIssue[] {
  const parsed = learningRouteDataSchema.safeParse(input);
  if (!parsed.success) {
    return [{
      code: "MISSING_TASKS",
      message: "学习路线缺少目标、周期、预算或可执行任务字段",
    }];
  }

  const data = parsed.data;
  const issues: LearningRouteQualityIssue[] = [];
  const allTasks = data.tasks.length > 0
    ? data.tasks
    : data.stages.flatMap((stage) => stage.tasks);

  if (allTasks.length === 0) {
    issues.push({ code: "MISSING_TASKS", message: "学习路线至少需要一个可执行任务" });
  }

  const weeks = periodToWeeks(data.period);
  if (weeks === null || weeks <= 0) {
    issues.push({ code: "INVALID_PERIOD", message: "学习路线周期必须包含可解析的天、周或月" });
  } else {
    const totalHours = allTasks.reduce((sum, task) => sum + task.estimatedHours, 0);
    const capacity = data.weeklyBudgetHours * weeks;
    if (totalHours > capacity) {
      issues.push({
        code: "WEEKLY_BUDGET_EXCEEDED",
        message: `任务总时长 ${totalHours} 小时超过周期预算 ${capacity} 小时`,
      });
    }
  }

  return issues;
}

export function assertLearningRouteDataQuality(input: unknown): void {
  const issues = assessLearningRouteDataQuality(input);
  if (issues.length > 0) throw new LearningRouteQualityError(issues);
}
