/**
 * 计划预算校验（plan 3.x / T14b）：近期 1–4 周任务的总投入不应超过用户每周可用时间（weeklyBudgetHours）。
 * 超出时给出解释，而不是偷偷超预算。纯函数、确定性。
 */

export interface BudgetTask {
  id: string;
  title: string;
  estimatedHours?: number | null;
  /** 相对周次（1/2/3/4 为近期；更大为远期里程碑） */
  dueWeek?: number;
}

export interface BudgetResult {
  ok: boolean;
  /** 近期（因未来 4 周内有明确小时数的任务）总投入 */
  totalNearTermHours: number;
  /** 由近期任务数摊到每周的投入 */
  weeklyHours: number;
  weeklyBudgetHours: number | null;
  /** 超出/合法时的解释 */
  message: string;
}

/** 近期 = 1–4 周内有明确预计小时的任务（不把远期里程碑误算进本周预算）。 */
export function calculatePlanBudget(tasks: BudgetTask[], weeklyBudgetHours: number | null): BudgetResult {
  const nearTerm = tasks.filter((t) => {
    const week = t.dueWeek ?? 0;
    const hours = t.estimatedHours;
    return week >= 1 && week <= 4 && hours != null && Number.isFinite(hours) && hours > 0;
  });

  const totalNearTermHours = nearTerm.reduce((sum, t) => sum + (t.estimatedHours ?? 0), 0);
  // 近期任务按周摊：把 1–4 周内的小时数视为 4 周的分布（若用户每周投入有限，按比例更高）
  const weeklyHours = nearTerm.length ? totalNearTermHours / 4 : 0;

  if (weeklyBudgetHours == null) {
    return { ok: true, totalNearTermHours, weeklyHours, weeklyBudgetHours: null, message: "未设置每周可用时间，暂不校验预算。" };
  }

  if (weeklyBudgetHours <= 0) {
    return { ok: true, totalNearTermHours, weeklyHours, weeklyBudgetHours, message: "每周可用时间为 0，本周暂不安排任务。" };
  }

  if (weeklyHours > weeklyBudgetHours) {
    return {
      ok: false,
      totalNearTermHours,
      weeklyHours,
      weeklyBudgetHours,
      message: `近期任务预计每周约 ${weeklyHours.toFixed(1)} 小时，超过你设置的每周 ${weeklyBudgetHours} 小时，建议精简或延后部分任务。`,
    };
  }

  return {
    ok: true,
    totalNearTermHours,
    weeklyHours,
    weeklyBudgetHours,
    message: `近期任务预计每周约 ${weeklyHours.toFixed(1)} 小时，在你的每周 ${weeklyBudgetHours} 小时预算内。`,
  };
}

/** 泛泛的任务词（无明确动作对象），用于识别“近斯任务不是无对象泛词”的质量问题（T14b）。 */
const VAGUE_TASK_TOKENS = ["核心材料", "小产出", "沉淀", "学习一下", "了解基础", "提升能力", "综合复习", "总结要点"];
const CONCRETE_TASK_MARKERS = ["比较", "写出", "整理成", "完成", "测试", "复述", "一页", "表格", "案例", "清单", "工具", "项目"];

export interface TaskQualityResult {
  vague: boolean;
  reason: string | null;
}

/** 判断一条近期任务是否足够具体（有对象/可检查交付物）；泛词返回 vague=true。 */
export function assessTaskConcreteness(title: string): TaskQualityResult {
  const trimmed = title.trim();
  if (!trimmed) return { vague: true, reason: "任务标题为空" };
  if (VAGUE_TASK_TOKENS.some((token) => trimmed.includes(token))) {
    return { vague: true, reason: `“${trimmed}” 缺乏明确动作对象，建议改为“选 2 个 X，围绕同一任务记录…交付一页比较表”这类可检查描述。` };
  }
  const hasMarker = CONCRETE_TASK_MARKERS.some((marker) => trimmed.includes(marker));
  if (!hasMarker) {
    return { vague: true, reason: `“${trimmed}” 缺少可检查的交付物/动词，无法判断是否有进步。` };
  }
  return { vague: false, reason: null };
}
