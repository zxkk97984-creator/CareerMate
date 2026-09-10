/**
 * Plan V1/V2 共享任务模型。
 *
 * 这个模块是成长概览、职业路径和资源上下文共用的唯一任务读取/统计入口：
 * - V1 的 months[].learningTasks 与 V2 的 phases[].actions 在这里归一化；
 * - 页面不再直接猜测旧月份结构或自行计算进度；
 * - 统计结果始终带算法版本、时间窗口和缺失原因，未知不会被当成 0。
 */

import type { TaskStatus } from "@/lib/types";
import type { CareerPlanRow } from "./compatibility";
import {
  convertV2ToV1Arrays,
  readPlanV1,
  readPlanV2,
  serializePlanV2,
  updateV1TaskStatus,
  updateV2ActionStatus,
} from "./compatibility";
import { aiCareerPlanV2Schema, type AiCareerPlanV2, type PlanActionV2, type PlanDuration } from "./schema-v2";

export const PLAN_TASK_ALGORITHM_VERSION = "plan-task-v1" as const;

export interface UnifiedPlanTask {
  id: string;
  title: string;
  description: string;
  type: string;
  status: TaskStatus;
  estimatedHours: number | null;
  cadence: string | null;
  resources: string[];
  phaseId: string | null;
  phaseTitle: string | null;
  dueWeek: number | null;
  outputs: string[];
  acceptanceCriteria: string[];
  order: number;
  sourceVersion: 1 | 2;
}

export interface PlanWeekSummary {
  week: number;
  taskIds: string[];
  estimatedHours: number;
  overBudget: boolean;
}

export interface PlanTaskSummary {
  algorithmVersion: typeof PLAN_TASK_ALGORITHM_VERSION;
  timeWindow: {
    /** 统计覆盖的周次范围；null 表示任务没有可比较的周次。 */
    fromWeek: number | null;
    toWeek: number | null;
  };
  total: number;
  done: number;
  inProgress: number;
  delayed: number;
  notStarted: number;
  /** 只有存在任务时才计算，避免空计划显示 0% 伪装成“有进度”。 */
  completionRate: number | null;
  totalEstimatedHours: number;
  plannedWeeklyHours: number | null;
  weeklyBudgetHours: number | null;
  budgetStatus: "within" | "over" | "unknown";
  budgetMessage: string;
  overBudgetWeeks: number[];
  weeks: PlanWeekSummary[];
  nearTermTaskIds: string[];
  currentPhaseId: string | null;
  currentPhaseTitle: string | null;
  missingReasons: string[];
}

export type UnifiedTaskUpdateResult =
  | { kind: "invalid"; reason: string }
  | { kind: "missing" }
  | { kind: "unchanged"; previousStatus: TaskStatus }
  | {
    kind: "updated";
    previousStatus: TaskStatus;
    schemaVersion: 1 | 2;
    content?: string;
    months?: string;
    years?: string;
    quarters?: string;
  };

const WEEK_FACTORS: Record<PlanDuration["unit"], number> = {
  day: 1 / 7,
  week: 1,
  month: 4.345,
  year: 52.14,
};

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeStatus(value: unknown): TaskStatus {
  return value === "in_progress" || value === "done" || value === "delayed"
    ? value
    : "not_started";
}

function positiveIntegerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.ceil(value)
    : null;
}

export function durationToWeeks(duration: PlanDuration): number {
  return Math.max(1, Math.ceil(duration.value * WEEK_FACTORS[duration.unit]));
}

export function horizonToWeeks(plan: AiCareerPlanV2): number {
  const total = durationToWeeks(plan.horizon);
  const phaseTotal = plan.phases.reduce((sum, phase) => sum + durationToWeeks(phase.duration), 0);
  return Math.max(total, phaseTotal);
}

function actionToTask(
  action: PlanActionV2,
  input: {
    phaseId: string | null;
    phaseTitle: string | null;
    phaseOutputs: string[];
    phaseAcceptance: string[];
    dueWeek: number | null;
    order: number;
    sourceVersion: 1 | 2;
  },
): UnifiedPlanTask {
  return {
    id: action.id,
    title: action.title,
    description: action.description,
    type: action.type,
    status: normalizeStatus(action.status),
    estimatedHours: action.estimatedHours ?? null,
    cadence: action.cadence ?? null,
    resources: [...action.resources],
    phaseId: input.phaseId,
    phaseTitle: input.phaseTitle,
    dueWeek: input.dueWeek,
    outputs: [...(action.outputs ?? input.phaseOutputs)],
    acceptanceCriteria: [...(action.acceptanceCriteria ?? input.phaseAcceptance)],
    order: input.order,
    sourceVersion: input.sourceVersion,
  };
}

function normalizeV2Tasks(plan: AiCareerPlanV2): UnifiedPlanTask[] {
  const tasks: UnifiedPlanTask[] = [];
  let elapsedWeeks = 0;
  let order = 0;

  for (const phase of plan.phases) {
    const phaseWeeks = durationToWeeks(phase.duration);
    const actions = phase.actions;
    actions.forEach((action, actionIndex) => {
      // 把阶段时长按动作顺序分摊到周次；这是显示和排序用的近似值，不写回计划内容。
      const dueWeek = Math.max(
        1,
        Math.ceil(elapsedWeeks + (phaseWeeks * (actionIndex + 1)) / Math.max(1, actions.length)),
      );
      tasks.push(actionToTask(action, {
        phaseId: phase.id,
        phaseTitle: phase.title,
        phaseOutputs: phase.outputs,
        phaseAcceptance: phase.evaluationCriteria,
        dueWeek,
        order: order++,
        sourceVersion: 2,
      }));
    });
    elapsedWeeks += phaseWeeks;
  }

  for (const action of plan.immediateActions) {
    tasks.push(actionToTask(action, {
      phaseId: "immediate",
      phaseTitle: "立即行动",
      phaseOutputs: [],
      phaseAcceptance: [],
      dueWeek: 1,
      order: order++,
      sourceVersion: 2,
    }));
  }

  return tasks;
}

function normalizeV1Tasks(row: CareerPlanRow): UnifiedPlanTask[] {
  const plan = readPlanV1(row);
  // 某些兼容读路径只保存了 content.months，旧字段为空；仍按 V1 读取，不丢任务。
  const content = safeJsonParse<Record<string, unknown>>(row.content, {});
  const months = plan.months.length > 0
    ? plan.months
    : Array.isArray(content.months) ? content.months : [];
  const tasks: UnifiedPlanTask[] = [];
  let order = 0;

  for (const rawMonth of months) {
    if (!rawMonth || typeof rawMonth !== "object" || Array.isArray(rawMonth)) continue;
    const month = rawMonth as Record<string, unknown>;
    const monthIndex = typeof month.monthIndex === "number" ? month.monthIndex : order + 1;
    const goal = typeof month.goal === "string" ? month.goal : `第 ${monthIndex} 个月`;
    const learningTasks = Array.isArray(month.learningTasks) ? month.learningTasks : [];
    const outputs = Array.isArray(month.practiceOutputs)
      ? month.practiceOutputs.filter((item): item is string => typeof item === "string")
      : [];
    const acceptance = Array.isArray(month.evaluationMetrics)
      ? month.evaluationMetrics.filter((item): item is string => typeof item === "string")
      : [];

    for (const rawTask of learningTasks) {
      if (!rawTask || typeof rawTask !== "object" || Array.isArray(rawTask)) continue;
      const task = rawTask as Record<string, unknown>;
      if (typeof task.id !== "string" || !task.id.trim()) continue;
      tasks.push({
        id: task.id,
        title: typeof task.title === "string" && task.title.trim() ? task.title : "未命名任务",
        description: typeof task.description === "string" ? task.description : "",
        type: typeof task.type === "string" && task.type.trim() ? task.type : "learning",
        status: normalizeStatus(task.status),
        estimatedHours: positiveIntegerOrNull(task.estimatedHours),
        cadence: typeof task.cadence === "string" ? task.cadence : null,
        resources: Array.isArray(task.resources)
          ? task.resources.filter((item): item is string => typeof item === "string")
          : [],
        phaseId: `month-${monthIndex}`,
        phaseTitle: goal,
        // V1 的 dueWeek 是“月内周次”，统一换算成从计划开始计算的计划周次。
        dueWeek: positiveIntegerOrNull(task.dueWeek) === null
          ? null
          : (monthIndex - 1) * 4 + positiveIntegerOrNull(task.dueWeek)!,
        outputs,
        acceptanceCriteria: acceptance,
        order: order++,
        sourceVersion: 1,
      });
    }
  }

  return tasks;
}

export function normalizePlanTasks(row: CareerPlanRow): UnifiedPlanTask[] {
  if (row.schemaVersion >= 2) {
    const plan = readPlanV2(row);
    if (plan) return normalizeV2Tasks(plan);
  }
  return normalizeV1Tasks(row);
}

const TASK_PRIORITY: Record<TaskStatus, number> = {
  in_progress: 0,
  delayed: 1,
  not_started: 2,
  done: 3,
};

export function sortPlanTasks(tasks: UnifiedPlanTask[]): UnifiedPlanTask[] {
  return [...tasks].sort((left, right) => {
    const priority = TASK_PRIORITY[left.status] - TASK_PRIORITY[right.status];
    if (priority !== 0) return priority;
    const leftWeek = left.dueWeek ?? Number.MAX_SAFE_INTEGER;
    const rightWeek = right.dueWeek ?? Number.MAX_SAFE_INTEGER;
    if (leftWeek !== rightWeek) return leftWeek - rightWeek;
    return left.order - right.order;
  });
}

export function selectUnifiedNextTask(tasks: UnifiedPlanTask[]): UnifiedPlanTask | null {
  return sortPlanTasks(tasks).find((task) => task.status !== "done") ?? null;
}

export function summarizePlanTasks(
  tasks: UnifiedPlanTask[],
  weeklyBudgetHours: number | null,
  currentWeek = 1,
): PlanTaskSummary {
  const done = tasks.filter((task) => task.status === "done").length;
  const inProgress = tasks.filter((task) => task.status === "in_progress").length;
  const delayed = tasks.filter((task) => task.status === "delayed").length;
  const notStarted = tasks.filter((task) => task.status === "not_started").length;
  const totalEstimatedHours = tasks.reduce((sum, task) => sum + (task.estimatedHours ?? 0), 0);

  const weeks = new Map<number, { taskIds: string[]; estimatedHours: number }>();
  for (const task of tasks) {
    if (task.dueWeek === null) continue;
    const week = weeks.get(task.dueWeek) ?? { taskIds: [], estimatedHours: 0 };
    week.taskIds.push(task.id);
    week.estimatedHours += task.estimatedHours ?? 0;
    weeks.set(task.dueWeek, week);
  }

  const missingReasons: string[] = [];
  if (tasks.length === 0) missingReasons.push("当前计划没有可读取的任务");
  if (tasks.some((task) => task.dueWeek === null)) missingReasons.push("部分任务缺少周次，无法参与本周预算");
  if (tasks.some((task) => task.estimatedHours === null)) missingReasons.push("部分任务缺少预计投入，统计按已知小时数计算");
  if (weeklyBudgetHours === null) missingReasons.push("未设置每周可用时间，预算状态未知");

  const sortedWeeks = [...weeks.entries()]
    .sort(([left], [right]) => left - right)
    .map(([week, value]) => ({
      week,
      taskIds: value.taskIds,
      estimatedHours: value.estimatedHours,
      overBudget: weeklyBudgetHours !== null && value.estimatedHours > weeklyBudgetHours,
    }));

  const windowStart = Math.max(1, currentWeek);
  const windowEnd = windowStart + 3;
  const nearTermTaskIds = sortPlanTasks(
    tasks.filter(
      (task) => task.status !== "done"
        && task.dueWeek !== null
        && task.dueWeek >= windowStart
        && task.dueWeek <= windowEnd,
    ),
  ).map((task) => task.id);
  const fallbackNearTermIds = nearTermTaskIds.length > 0
    ? nearTermTaskIds
    : sortPlanTasks(tasks.filter((task) => task.status !== "done")).slice(0, 3).map((task) => task.id);

  const overBudgetWeeks = sortedWeeks
    .filter((week) => week.overBudget)
    .map((week) => week.week);
  const weeksWithHours = sortedWeeks.filter((week) => week.estimatedHours > 0);
  const plannedWeeklyHours = weeksWithHours.length > 0
    ? Math.max(...weeksWithHours.map((week) => week.estimatedHours))
    : null;
  const hasUnknownScheduledHours = tasks.some(
    (task) => task.dueWeek !== null && task.estimatedHours === null,
  );

  let budgetStatus: PlanTaskSummary["budgetStatus"] = "unknown";
  let budgetMessage = "未设置每周可用时间，暂不判断预算。";
  if (weeklyBudgetHours !== null) {
    if (plannedWeeklyHours === null) {
      budgetMessage = "近期任务缺少预计投入，无法判断是否超出每周预算。";
    } else if (overBudgetWeeks.length > 0) {
      budgetStatus = "over";
      budgetMessage = `第 ${overBudgetWeeks.join("、")} 周安排最高约 ${plannedWeeklyHours} 小时，超过每周 ${weeklyBudgetHours} 小时预算。`;
    } else if (hasUnknownScheduledHours) {
      budgetMessage = "部分任务缺少预计投入，无法确认所有周次都在预算内。";
    } else {
      budgetStatus = "within";
      budgetMessage = `全部周次最多约 ${plannedWeeklyHours} 小时，在每周 ${weeklyBudgetHours} 小时预算内。`;
    }
  }

  const currentTask = selectUnifiedNextTask(tasks);
  const weekNumbers = tasks
    .map((task) => task.dueWeek)
    .filter((week): week is number => week !== null);

  return {
    algorithmVersion: PLAN_TASK_ALGORITHM_VERSION,
    timeWindow: {
      fromWeek: weekNumbers.length > 0 ? Math.min(...weekNumbers) : null,
      toWeek: weekNumbers.length > 0 ? Math.max(...weekNumbers) : null,
    },
    total: tasks.length,
    done,
    inProgress,
    delayed,
    notStarted,
    completionRate: tasks.length > 0 ? Math.round((done / tasks.length) * 100) : null,
    totalEstimatedHours,
    plannedWeeklyHours,
    weeklyBudgetHours,
    budgetStatus,
    budgetMessage,
    overBudgetWeeks,
    weeks: sortedWeeks,
    nearTermTaskIds: fallbackNearTermIds,
    currentPhaseId: currentTask?.phaseId ?? null,
    currentPhaseTitle: currentTask?.phaseTitle ?? null,
    missingReasons,
  };
}

export function updateUnifiedPlanTaskStatus(
  row: CareerPlanRow,
  taskId: string,
  status: TaskStatus,
): UnifiedTaskUpdateResult {
  if (row.schemaVersion >= 2) {
    const plan = readPlanV2(row);
    if (!plan) return { kind: "invalid", reason: "plan_v2_content" };
    const allActions = [
      ...plan.phases.flatMap((phase) => phase.actions),
      ...plan.immediateActions,
    ];
    const match = allActions.find((action) => action.id === taskId);
    if (!match) return { kind: "missing" };
    if (match.status === status) return { kind: "unchanged", previousStatus: match.status };

    const updated = updateV2ActionStatus(plan, taskId, status);
    const compatibility = convertV2ToV1Arrays(updated);
    return {
      kind: "updated",
      previousStatus: match.status,
      schemaVersion: 2,
      content: serializePlanV2(updated),
      months: JSON.stringify(compatibility.months),
      years: JSON.stringify(compatibility.years),
      quarters: JSON.stringify(compatibility.quarters),
    };
  }

  const plan = readPlanV1(row);
  const allTasks = plan.months.flatMap((month) => {
    if (!month || typeof month !== "object" || Array.isArray(month)) return [];
    const tasks = (month as Record<string, unknown>).learningTasks;
    return Array.isArray(tasks) ? tasks : [];
  });
  const match = allTasks.find(
    (task) => task && typeof task === "object" && !Array.isArray(task)
      && (task as Record<string, unknown>).id === taskId,
  ) as Record<string, unknown> | undefined;
  if (!match) return { kind: "missing" };
  const previousStatus = normalizeStatus(match.status);
  if (previousStatus === status) return { kind: "unchanged", previousStatus };

  const monthIndex = plan.months.findIndex((month) => {
    if (!month || typeof month !== "object" || Array.isArray(month)) return false;
    const tasks = (month as Record<string, unknown>).learningTasks;
    return Array.isArray(tasks) && tasks.some(
      (task) => task && typeof task === "object" && !Array.isArray(task)
        && (task as Record<string, unknown>).id === taskId,
    );
  });
  if (monthIndex < 0) return { kind: "missing" };

  const updated = updateV1TaskStatus(plan, monthIndex, taskId, status);
  return {
    kind: "updated",
    previousStatus,
    schemaVersion: 1,
    months: JSON.stringify(updated.months),
  };
}

const GENERIC_ACTION_TITLE = /^(完成|学习|输出|了解|提升|复习|总结)(一个|一份|相关|基础|核心)?(知识点|产出|内容|材料|能力|课程|任务)$/;

export interface PlanQualityIssue {
  code: "VAGUE_ACTION" | "MISSING_DESCRIPTION" | "MISSING_TIME" | "MISSING_OUTPUT" | "MISSING_ACCEPTANCE";
  phaseId: string;
  actionId: string;
  message: string;
}

export function assessPlanV2Quality(plan: AiCareerPlanV2): PlanQualityIssue[] {
  const issues: PlanQualityIssue[] = [];

  for (const phase of plan.phases) {
    for (const action of phase.actions) {
      const title = action.title.trim();
      const vague = title.length < 4 || GENERIC_ACTION_TITLE.test(title);
      if (vague) {
        issues.push({
          code: "VAGUE_ACTION",
          phaseId: phase.id,
          actionId: action.id,
          message: `动作“${action.title}”缺少明确对象或交付动作。`,
        });
      }
      // 新计划的所有动作都必须可执行；旧计划只在读取层兼容，不通过质量门写回。
      if (action.description.trim().length < 8) {
        issues.push({
          code: "MISSING_DESCRIPTION",
          phaseId: phase.id,
          actionId: action.id,
          message: `动作“${action.title}”缺少可执行说明。`,
        });
      }
      if (action.estimatedHours == null && !action.cadence?.trim()) {
        issues.push({
          code: "MISSING_TIME",
          phaseId: phase.id,
          actionId: action.id,
          message: `动作“${action.title}”缺少预计投入或节奏。`,
        });
      }
      if ((action.outputs ?? phase.outputs).filter((item) => item.trim()).length === 0) {
        issues.push({
          code: "MISSING_OUTPUT",
          phaseId: phase.id,
          actionId: action.id,
          message: `动作“${action.title}”没有说明产出什么。`,
        });
      }
      if ((action.acceptanceCriteria ?? phase.evaluationCriteria).filter((item) => item.trim()).length === 0) {
        issues.push({
          code: "MISSING_ACCEPTANCE",
          phaseId: phase.id,
          actionId: action.id,
          message: `动作“${action.title}”没有验收标准。`,
        });
      }
    }
  }

  return issues;
}

export function assertPlanV2Quality(plan: AiCareerPlanV2): void {
  const issues = assessPlanV2Quality(plan);
  if (issues.length > 0) {
    throw new PlanQualityError(issues);
  }
}

/** 候选 data 形状为 { plan: AiCareerPlanV2 }；只对可解析的新计划执行质量门。 */
export function assertPlanDataQuality(data: unknown): void {
  const plan = data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>).plan
    : undefined;
  if (!plan) return;
  const parsed = aiCareerPlanV2Schema.safeParse(plan);
  if (parsed.success) assertPlanV2Quality(parsed.data);
}

export class PlanQualityError extends Error {
  constructor(public readonly issues: PlanQualityIssue[]) {
    super(`计划质量检查未通过：${issues.map((issue) => issue.message).join("；")}`);
    this.name = "PlanQualityError";
  }
}

export function planTaskSummaryFromRow(
  row: CareerPlanRow,
  weeklyBudgetHours: number | null,
): { tasks: UnifiedPlanTask[]; summary: PlanTaskSummary; planV2: AiCareerPlanV2 | null } {
  const tasks = normalizePlanTasks(row);
  const currentWeek = row.currentMonthIndex > 0 ? (row.currentMonthIndex - 1) * 4 + 1 : 1;
  return {
    tasks,
    summary: summarizePlanTasks(tasks, weeklyBudgetHours, currentWeek),
    planV2: row.schemaVersion >= 2 ? readPlanV2(row) : null,
  };
}

export function parsePlanContentV2(content: string | null | undefined): AiCareerPlanV2 | null {
  if (!content) return null;
  const raw = safeJsonParse<unknown>(content, null);
  if (!raw) return null;
  const parsed = aiCareerPlanV2Schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
