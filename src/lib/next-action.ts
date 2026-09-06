/**
 * 首页“下一步”选择（plan 3.3 / T11）。纯函数、确定性：同输入必得同结果，不随机。
 *
 * 依序评估：
 *  1. 画像未完整 → 去引导；
 *  2. 无 active 计划但有 pending → 审阅计划；
 *  3. 无计划 → 生成首个计划；
 *  4. 有进行中任务 → 继续该任务；
 *  5. 有延期任务 → 查看延期并调整；
 *  6. 其他未完成任务 → 按 dueWeek、原始顺序选择第一项；
 *  7. 本期全完成 → 查看复盘/下一阶段。
 */

import { taskStatuses, type TaskStatus } from "@/lib/types";

export interface NextActionTask {
  id: string;
  title: string;
  status: TaskStatus;
  dueWeek?: number;
  /** 原始顺序（越靠前越优先） */
  order?: number;
}

export interface NextActionInput {
  profileCompleted: boolean;
  /** 当前生效计划（active）；无则 null */
  plan: { id: string } | null;
  /** 待确认计划候选 */
  pendingPlan: { id: string } | null;
  /** 当期任务列表（同一计划版本） */
  tasks: NextActionTask[];
  /** 是否有可复盘内容（已完成 ≥1） */
  hasCompleted?: boolean;
}

export type NextAction =
  | { kind: "onboarding"; title: string; reason: string; actionLabel: string; href: string }
  | { kind: "review_pending_plan"; planId: string; title: string; reason: string; actionLabel: string; href: string }
  | { kind: "generate_first_plan"; title: string; reason: string; actionLabel: string; href: string }
  | { kind: "continue_task"; taskId: string; taskTitle: string; title: string; reason: string; actionLabel: string; href: string }
  | { kind: "review_delayed"; taskIds: string[]; title: string; reason: string; actionLabel: string; href: string }
  | { kind: "next_task"; taskId: string; taskTitle: string; title: string; reason: string; actionLabel: string; href: string }
  | { kind: "review_period"; title: string; reason: string; actionLabel: string; href: string };

const ORDER_PRIORITY: Record<TaskStatus, number> = {
  in_progress: 0,
  delayed: 1,
  not_started: 2,
  done: 3,
};

/** 排序：进行中 > 延期 > 未开始 > 完成；同等优先级按 dueWeek（无则取大）、再按原始顺序。 */
function sortTasks(tasks: NextActionTask[]): NextActionTask[] {
  return [...tasks].sort((a, b) => {
    const pa = ORDER_PRIORITY[a.status] ?? 9;
    const pb = ORDER_PRIORITY[b.status] ?? 9;
    if (pa !== pb) return pa - pb;
    const da = a.dueWeek ?? Number.MAX_SAFE_INTEGER;
    const db = b.dueWeek ?? Number.MAX_SAFE_INTEGER;
    if (da !== db) return da - db;
    return (a.order ?? 0) - (b.order ?? 0);
  });
}

export function selectNextAction(input: NextActionInput): NextAction {
  // 1. 画像未完整 → 去引导（不管是否有计划）
  if (!input.profileCompleted) {
    return {
      kind: "onboarding",
      title: "先完成你的职业画像",
      reason: "完善的画像才能生成贴合你的任务与计划。",
      actionLabel: "继续画像引导",
      href: "/onboarding",
    };
  }

  const hasActivePlan = Boolean(input.plan);
  const pending = input.pendingPlan;

  // 2. 无 active 计划但有 pending → 审阅计划
  if (!hasActivePlan && pending) {
    return {
      kind: "review_pending_plan",
      planId: pending.id,
      title: "审阅你的新计划",
      reason: "新计划已准备好，确认后开始执行。",
      actionLabel: "审阅计划",
      href: "/path",
    };
  }

  // 3. 无计划（无 active 且无 pending）→ 生成首个计划
  if (!hasActivePlan) {
    return {
      kind: "generate_first_plan",
      title: "生成你的第一个计划",
      reason: "先生成一个适合本周投入的计划。",
      actionLabel: "生成计划",
      href: "/dashboard",
    };
  }

  // 有 active 计划，按任务状态决定
  const sorted = sortTasks(input.tasks);
  const inProgress = sorted.find((t) => t.status === "in_progress");
  const delayed = sorted.filter((t) => t.status === "delayed");
  const notStarted = sorted.filter((t) => t.status === "not_started");

  // 4. 有进行中任务 → 继续该任务
  if (inProgress) {
    return {
      kind: "continue_task",
      taskId: inProgress.id,
      taskTitle: inProgress.title,
      title: inProgress.title,
      reason: "当前有一个任务进行中，继续推进它。",
      actionLabel: "继续任务",
      href: `/path#task-${inProgress.id}`,
    };
  }

  // 5. 有延期任务 → 查看延期并调整
  if (delayed.length > 0) {
    return {
      kind: "review_delayed",
      taskIds: delayed.map((t) => t.id),
      title: "处理延期的任务",
      reason: `有 ${delayed.length} 个任务延期，查看并调整节奏。`,
      actionLabel: "查看延期",
      href: "/path",
    };
  }

  // 6. 其他未完成任务 → 按 dueWeek、原始顺序选第一项
  if (notStarted.length > 0) {
    const first = notStarted[0];
    return {
      kind: "next_task",
      taskId: first.id,
      taskTitle: first.title,
      title: first.title,
      reason: "这是当前最应安排的第一项任务。",
      actionLabel: "开始任务",
      href: `/path#task-${first.id}`,
    };
  }

  // 7. 全完成/无可推进 → 查看复盘或下一阶段
  return {
    kind: "review_period",
    title: "本期任务已全部完成",
    reason: input.hasCompleted ? "本期已完成，查看复盘并规划下一阶段。" : "当前没有待推进的任务。",
    actionLabel: "查看复盘",
    href: "/path",
  };
}

export { taskStatuses };
