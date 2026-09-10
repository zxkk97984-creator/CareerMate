import { abilityKeys, abilityLabels, type ProfileDto } from "@/lib/types";
import type { MatchData } from "@/lib/workspace-types";
import { selectNextAction } from "@/lib/next-action";
import { selectUnifiedNextTask, summarizePlanTasks, type PlanTaskSummary, type UnifiedPlanTask } from "@/lib/plans/task-model";

export interface DashboardEvidence {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
}

export interface DashboardAttention {
  id: string;
  title: string;
  description: string;
  href: string;
  label: string;
  tone: "info" | "warning";
}

export interface DashboardDto {
  planId: string | null;
  targetRole: string | null;
  progress: Pick<PlanTaskSummary, "total" | "done" | "inProgress" | "delayed" | "completionRate" | "currentPhaseTitle" | "weeklyBudgetHours" | "budgetStatus" | "budgetMessage">;
  action: { kind: "task" | "generate" | "link"; title: string; reason: string; label: string; href: string | null; task: UnifiedPlanTask | null };
  recentTasks: UnifiedPlanTask[];
  attention: DashboardAttention[];
  candidateCount: number;
  abilities: Array<{ key: string; label: string; score: number | null }>;
  match: MatchData | null;
  evidence: DashboardEvidence[];
}

interface DashboardInput {
  profile: Pick<ProfileDto, "onboardingCompleted" | "targetRoleLabel" | "weeklyAvailableHours" | "abilityScores"> | null;
  plan: { id: string; tasks: UnifiedPlanTask[]; targetRoleLabel?: string | null } | null;
  pendingPlan: { id: string; status: string } | null;
  match: MatchData | null;
  candidateCount: number;
  evidence: DashboardEvidence[];
}

export function buildDashboard(input: DashboardInput): DashboardDto {
  const { profile, plan, pendingPlan } = input;
  const tasks = plan?.tasks ?? [];
  const summary = summarizePlanTasks(tasks, profile?.weeklyAvailableHours ?? null);
  const nextTask = selectUnifiedNextTask(tasks);
  const base = selectNextAction({ profileCompleted: Boolean(profile?.onboardingCompleted), plan, pendingPlan, tasks: tasks.map((task) => ({ ...task, dueWeek: task.dueWeek ?? undefined })), hasCompleted: summary.done > 0 });
  const attention: DashboardAttention[] = [];
  if (pendingPlan) {
    const pending = pendingPlan.status === "pending";
    const failed = pendingPlan.status === "generation_failed";
    attention.push({ id: "plan", title: pending ? "新计划已准备好" : failed ? "计划生成未完成" : "正在准备新计划", description: pending ? "审阅并确认后，新计划才会生效。" : failed ? "前往职业路径查看原因并重试。" : "可以先继续当前任务，在职业路径查看生成进度。", href: "/path", label: pending ? "审阅计划" : failed ? "查看并重试" : "查看进度", tone: failed ? "warning" : "info" });
  }
  if (summary.delayed > 0) attention.push({ id: "delayed", title: `${summary.delayed} 项任务已延期`, description: "查看阻塞原因，调整后继续推进。", href: "/path", label: "处理延期", tone: "warning" });
  if (summary.budgetStatus === "over") attention.push({ id: "budget", title: "计划投入超出每周预算", description: summary.budgetMessage, href: "/path", label: "调整安排", tone: "warning" });
  if (input.candidateCount > 0) attention.push({ id: "candidates", title: `${input.candidateCount} 条建议待确认`, description: "检查画像、能力与记忆建议，由你决定是否采纳。", href: "/memory", label: "审阅建议", tone: "info" });

  let action: DashboardDto["action"] = { kind: "link", title: base.title, reason: base.reason, label: base.actionLabel, href: base.href, task: null };
  if (profile?.onboardingCompleted) {
    if (!plan && pendingPlan) {
      const item = attention[0];
      action = { kind: "link", title: item.title, reason: item.description, label: item.label, href: item.href, task: null };
    } else if (nextTask) {
      action = { kind: "task", title: nextTask.title, reason: nextTask.status === "in_progress" ? "继续正在推进的任务，把这一步变成成果。" : nextTask.status === "delayed" ? "这项任务已延期，先处理阻塞，再继续推进。" : "从这一步开始，向你的职业目标靠近。", label: nextTask.status === "in_progress" ? "标记完成" : "开始任务", href: `/path?taskId=${encodeURIComponent(nextTask.id)}`, task: nextTask };
    } else if (!plan || tasks.length === 0) {
      action = pendingPlan
        ? { kind: "link", title: attention[0].title, reason: attention[0].description, label: attention[0].label, href: "/path", task: null }
        : { kind: "generate", title: plan ? "当前计划还没有可执行任务" : "开启你的第一份成长计划", reason: "根据你的职业目标与可用时间生成计划，审阅后再开始执行。", label: plan ? "重新生成计划" : "生成计划", href: null, task: null };
    }
  }
  const { total, done, inProgress, delayed, completionRate, currentPhaseTitle, weeklyBudgetHours, budgetStatus, budgetMessage } = summary;
  return {
    planId: plan?.id ?? null,
    targetRole: plan?.targetRoleLabel ?? profile?.targetRoleLabel ?? null,
    progress: { total, done, inProgress, delayed, completionRate, currentPhaseTitle, weeklyBudgetHours, budgetStatus, budgetMessage },
    action, recentTasks: summary.nearTermTaskIds.map((id) => tasks.find((task) => task.id === id)!).slice(0, 5), attention,
    candidateCount: input.candidateCount,
    abilities: abilityKeys.map((key) => { const score = profile?.abilityScores[key]; return { key, label: abilityLabels[key], score: typeof score === "number" && Number.isFinite(score) ? score : null }; }),
    match: input.match, evidence: input.evidence,
  };
}

export const GROWTH_EVENTS = ["task_status_updated", "simulation_completed", "learning_route_accepted", "profile_updated", "onboarding_completed"];
type EvidenceLog = { id: string; eventType: string; title: string; summary: string; metadata: string; createdAt: Date };

function metadataOf(raw: string): Record<string, unknown> {
  try { const value = JSON.parse(raw); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch { return {}; }
}

export function isGrowthEvidence(log: Pick<EvidenceLog, "eventType" | "metadata" | "summary">): boolean {
  return GROWTH_EVENTS.includes(log.eventType) && (log.eventType !== "task_status_updated" || metadataOf(log.metadata).status === "done");
}

export function presentEvidence(log: EvidenceLog, originalTaskTitle?: string): DashboardEvidence {
  const meta = metadataOf(log.metadata);
  const taskTitle = typeof meta.taskTitle === "string" && meta.taskTitle.trim() ? meta.taskTitle : originalTaskTitle;
  return { id: log.id, title: log.eventType === "task_status_updated" ? taskTitle || "完成一项成长任务" : log.title, summary: log.eventType === "task_status_updated" ? "已完成任务" : log.summary, createdAt: log.createdAt.toISOString() };
}
