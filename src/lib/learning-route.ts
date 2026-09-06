/**
 * LearningRoute 展示适配器（plan 3.5 / T15）：不直接把 z.unknown 数组渲染。
 * 显式校验内容形状，未知字段降级；与关联计划版本并列，归档计划给出提示。
 * 不新增第二套任务状态——这里只读现有 learningRoute content 做展示投影。
 */

export interface LearningRouteView {
  present: boolean;
  targetRole: string | null;
  weeklyBudgetHours: number | null;
  period: string | null;
  stages: Array<{ title: string; description?: string; tasks?: string[] }>;
  tasks: string[];
  resources: string[];
  deliverables: string[];
  acceptanceCriteria: string[];
  /** 内容损坏/形状未知时的降级说明 */
  degraded: string | null;
  relatedPlan: RelatedPlanView | null;
  /** 本路线基于哪个版本的计划生成 */
  basePlanVersion: number | number[] | null;
}

export interface RelatedPlanView {
  id: string;
  targetRoleLabel: string | null;
  version: number;
  status: string;
  /** 关联的已是归档计划 → 需复盘提示，不自动迁移 */
  archived: boolean;
}

interface RawContent {
  targetRole?: unknown;
  weeklyBudgetHours?: unknown;
  period?: unknown;
  stages?: unknown;
  tasks?: unknown;
  resources?: unknown;
  deliverables?: unknown;
  acceptanceCriteria?: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string" && v.trim()) as string[] : [];
}

function asStages(value: unknown): Array<{ title: string; description?: string; tasks?: string[] }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): Array<{ title: string; description?: string; tasks?: string[] }> => {
    if (typeof item !== "object" || item === null) return [];
    const obj = item as Record<string, unknown>;
    const title = asString(obj.title ?? obj.name ?? obj.phase);
    if (!title) return [];
    return [{
      title,
      description: asString(obj.description ?? obj.goal) ?? undefined,
      tasks: asStringArray(obj.tasks ?? obj.actions ?? obj.items),
    }];
  });
}

/** 把 learningRoute content 安全投影为展示结构；损坏/未知形状给出 degraded 说明，不抛异常、不渲染裸数组。 */
export function toLearningRouteView(
  content: unknown,
  relatedPlan: { id: string; targetRoleLabel: string | null; version: number; status: string } | null,
  basePlanVersion: number | number[] | null,
): LearningRouteView {
  // 内容非对象（损坏 JSON 或空）→ 降级
  if (typeof content !== "object" || content === null || Array.isArray(content)) {
    return {
      present: false, targetRole: null, weeklyBudgetHours: null, period: null,
      stages: [], tasks: [], resources: [], deliverables: [], acceptanceCriteria: [],
      degraded: "学习路线内容暂无法解析，可按需重新生成。",
      relatedPlan: relatedPlan ? toRelatedPlan(relatedPlan) : null,
      basePlanVersion,
    };
  }

  const c = content as RawContent;
  const stages = asStages(c.stages);
  const tasks = asStringArray(c.tasks);
  const resources = asStringArray(c.resources);
  const deliverables = asStringArray(c.deliverables);
  const acceptanceCriteria = asStringArray(c.acceptanceCriteria);
  const weeklyBudgetHours = typeof c.weeklyBudgetHours === "number" && c.weeklyBudgetHours > 0 ? Math.round(c.weeklyBudgetHours) : null;

  // 完全空内容 → 降级
  const empty = stages.length === 0 && tasks.length === 0 && deliverables.length === 0 && acceptanceCriteria.length === 0;
  const targetRole = asString(c.targetRole);
  const period = asString(c.period);

  return {
    present: !empty,
    targetRole,
    weeklyBudgetHours,
    period,
    stages,
    tasks,
    resources,
    deliverables,
    acceptanceCriteria,
    degraded: empty ? "学习路线暂无已确认的安排，可让 AI 基于当前计划生成。" : null,
    relatedPlan: relatedPlan ? toRelatedPlan(relatedPlan) : null,
    basePlanVersion,
  };
}

function toRelatedPlan(plan: { id: string; targetRoleLabel: string | null; version: number; status: string }): RelatedPlanView {
  const archived = plan.status === "archived";
  return { ...plan, archived };
}
