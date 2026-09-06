/**
 * 任务详情读模型（plan 4.3 / T14a）：只读现有字段，缺值明确“待细化”，
 * 月份级交付物/完成标准标为“本阶段共同要求”，不错误归属到某单任务。
 */

import type { PlanMonth, PlanTask, TaskStatus } from "@/lib/types";

export const taskTypeLabels: Record<string, string> = {
  learn: "学习",
  practice: "实践",
  review: "复盘",
  simulation: "模拟",
};

export interface TaskDetailView {
  id: string;
  title: string;
  typeLabel: string;
  status: TaskStatus;
  /** 相对周次：只写“第 N 周”，不从 dueWeek 推断真实日历到期日 */
  weekLabel: string | null;
  /** 预计投入；无则“待细化” */
  estimatedHours: string | null;
  /** 单任务专属步骤/细节：目前 PlanTask 未单独携带，统一“待细化”，不做前端臆造 */
  steps: string[] | null;
  /** 单任务交付物：目前来自月份级 practiceOutputs，属“本阶段共同要求” */
  deliverables: string[] | null;
  /** 单任务完成标准：目前来自月份级 evaluationMetrics，属“本阶段共同要求” */
  completionCriteria: string[] | null;
  /** 是否月份级共享（deliverables/criteria 来自整月而非单任务） */
  sharedByMonth: boolean;
}

export interface TaskDetailInput {
  task: PlanTask & { estimatedHours?: number | null; steps?: string[] };
  month: PlanMonth | null;
}

export function buildTaskDetail({ task, month }: TaskDetailInput): TaskDetailView {
  const typeLabel = taskTypeLabels[task.type] ?? task.type;
  const weekLabel = task.dueWeek != null ? `第 ${task.dueWeek} 周` : null;

  const hasMonthOutputs = Boolean(month?.practiceOutputs?.length);
  const hasMonthMetrics = Boolean(month?.evaluationMetrics?.length);

  return {
    id: task.id,
    title: task.title,
    typeLabel,
    status: task.status,
    weekLabel,
    estimatedHours: task.estimatedHours != null ? `${task.estimatedHours} 小时` : null,
    // 单任务无独立 steps/交付物/标准字段 → 待细化，不臆造
    steps: null,
    // 月份级交付物/标准是“本阶段共同要求”，不是该单任务专属
    deliverables: hasMonthOutputs ? month!.practiceOutputs : null,
    completionCriteria: hasMonthMetrics ? month!.evaluationMetrics : null,
    sharedByMonth: hasMonthOutputs || hasMonthMetrics,
  };
}

/** 状态从 PATCH 后由服务端返回，这里只是 UI 文案映射（不在前端改成别的枚举）。 */
export function taskStatusLabel(status: TaskStatus): string {
  switch (status) {
    case "not_started": return "未开始";
    case "in_progress": return "进行中";
    case "done": return "已完成";
    case "delayed": return "已延期";
  }
}
