/**
 * CareerPlan V1/V2 双读兼容层。
 *
 * 规则：
 * - schemaVersion=1: 读取旧 years/quarters/months 字段
 * - schemaVersion=2: 读取 content JSON 字段
 * - V1 仍可更新任务状态（months）
 * - V2 写入 content.phases[].actions[] 状态
 * - 批量伪转换历史计划 → 禁止
 */

import type { AiCareerPlanV2 } from "./schema-v2";
import { aiCareerPlanV2Schema } from "./schema-v2";

// ── V1 类型 ─────────────────────────────────────

export interface CareerPlanV1 {
  schemaVersion: 1;
  years: unknown[];
  quarters: unknown[];
  months: unknown[];
  currentMonthIndex: number;
  assumptions: string[];
  riskNotes: string[];
}

export interface CareerPlanRow {
  id: string;
  userId: string;
  targetRole: string;
  targetRoleLabel: string | null;
  version: number;
  status: string;
  schemaVersion: number;
  content: string;
  parentPlanId: string | null;
  activatedAt: Date | null;
  years: string;
  quarters: string;
  months: string;
  currentMonthIndex: number;
  assumptions: string;
  riskNotes: string;
  generationMeta: string;
}

// ── 读取 ────────────────────────────────────────

/** 读取 CareerPlan 的 V1 视图 */
export function readPlanV1(row: CareerPlanRow): CareerPlanV1 {
  return {
    schemaVersion: 1,
    years: safeJsonParse(row.years, []),
    quarters: safeJsonParse(row.quarters, []),
    months: safeJsonParse(row.months, []),
    currentMonthIndex: row.currentMonthIndex,
    assumptions: safeJsonParse(row.assumptions, []),
    riskNotes: safeJsonParse(row.riskNotes, []),
  };
}

/** 读取 CareerPlan 的 V2 视图 */
export function readPlanV2(row: CareerPlanRow): AiCareerPlanV2 | null {
  if (row.schemaVersion < 2) return null;
  const content = safeJsonParse(row.content, null);
  if (!content) return null;
  const parsed = aiCareerPlanV2Schema.safeParse(content);
  return parsed.success ? parsed.data : null;
}

/** 自动判断版本并读取 */
export function readPlan(row: CareerPlanRow): CareerPlanV1 | AiCareerPlanV2 {
  if (row.schemaVersion >= 2) {
    const v2 = readPlanV2(row);
    if (v2) return v2;
  }
  return readPlanV1(row);
}

/** 是否为 V2 计划 */
export function isPlanV2(row: CareerPlanRow): boolean {
  return row.schemaVersion >= 2;
}

// ── 任务状态更新 ────────────────────────────────

/** 更新 V1 计划中某月的任务状态 */
export function updateV1TaskStatus(
  plan: CareerPlanV1,
  monthIndex: number,
  taskId: string,
  status: string,
): CareerPlanV1 {
  const months = plan.months.map((m: unknown, idx: number) => {
    if (idx !== monthIndex) return m;
    const month = m as Record<string, unknown>;
    const tasks = (month.learningTasks as Array<Record<string, unknown>>) ?? [];
    return {
      ...month,
      learningTasks: tasks.map((t) =>
        t.id === taskId ? { ...t, status } : t,
      ),
    };
  });
  return { ...plan, months };
}

/** 更新 V2 计划中某动作的状态 */
export function updateV2ActionStatus(
  plan: AiCareerPlanV2,
  actionId: string,
  status: "not_started" | "in_progress" | "done" | "delayed",
): AiCareerPlanV2 {
  return {
    ...plan,
    phases: plan.phases.map((phase) => ({
      ...phase,
      actions: phase.actions.map((a) =>
        a.id === actionId ? { ...a, status } : a,
      ),
    })),
    immediateActions: plan.immediateActions.map((a) =>
      a.id === actionId ? { ...a, status } : a,
    ),
  };
}

// ── 序列化 ──────────────────────────────────────

/** 将 Plan V2 序列化为 content 字段 */
export function serializePlanV2(plan: AiCareerPlanV2): string {
  return JSON.stringify(plan);
}

/** 将 Plan V1 序列化到旧字段 */
export function serializePlanV1(plan: CareerPlanV1) {
  return {
    years: JSON.stringify(plan.years),
    quarters: JSON.stringify(plan.quarters),
    months: JSON.stringify(plan.months),
    assumptions: JSON.stringify(plan.assumptions),
    riskNotes: JSON.stringify(plan.riskNotes),
  };
}

// ── V2 到 V1 转换（填充 years/quarters/months 用于渲染）──

/** 将 Plan V2 的 phases 展开为 V1 兼容的 years/quarters/months 数组 */
export function convertV2ToV1Arrays(v2: AiCareerPlanV2): {
  years: Array<{ yearIndex: number; goal: string }>;
  quarters: Array<{ quarterIndex: number; goal: string; milestone: string }>;
  months: Array<{ monthIndex: number; goal: string; learningTasks: Array<{ id: string; title: string; type: string; status: string; dueWeek: number }>; practiceOutputs: string[]; evaluationMetrics: string[] }>;
  currentMonthIndex: number;
} {
  const horizonValue = v2.horizon?.value ?? v2.phases.length;
  const years: Array<{ yearIndex: number; goal: string }> = [];
  const quarters: Array<{ quarterIndex: number; goal: string; milestone: string }> = [];
  const months: Array<{ monthIndex: number; goal: string; learningTasks: Array<{ id: string; title: string; type: string; status: string; dueWeek: number }>; practiceOutputs: string[]; evaluationMetrics: string[] }> = [];

  let monthCounter = 1;

  for (let yi = 0; yi < horizonValue; yi++) {
    const phase = v2.phases[yi] ?? v2.phases[v2.phases.length - 1];
    const yearGoal = phase?.objective ?? phase?.title ?? `第${yi + 1}年`;
    years.push({ yearIndex: yi + 1, goal: yearGoal });

    for (let qi = 0; qi < 4; qi++) {
      const quarterIndex = yi * 4 + qi + 1;
      quarters.push({
        quarterIndex,
        goal: `Q${qi + 1}: ${yearGoal}`,
        milestone: phase?.actions?.[qi]?.title ?? phase?.actions?.[0]?.title ?? "",
      });

      for (let mi = 0; mi < 3; mi++) {
        const actionIndex = qi * 3 + mi;
        const action = phase?.actions?.[actionIndex];
        months.push({
          monthIndex: monthCounter,
          goal: action?.title ?? `${yearGoal} - M${mi + 1}`,
          learningTasks: action ? [{ id: action.id, title: action.title, type: action.type, status: action.status, dueWeek: mi + 1 }] : [],
          practiceOutputs: phase?.outputs ?? [],
          evaluationMetrics: phase?.evaluationCriteria ?? [],
        });
        monthCounter++;
      }
    }
  }

  return { years, quarters, months, currentMonthIndex: 1 };
}

// ── 辅助 ────────────────────────────────────────

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
