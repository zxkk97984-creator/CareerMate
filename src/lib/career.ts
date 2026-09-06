import { getPrisma } from "@/lib/prisma";
import { toJson } from "@/lib/json";
import { abilityLabels } from "@/lib/types";
import type { CareerPlan } from "@/lib/tbox/schemas";
import type { AbilityKey, ProfileDto } from "@/lib/types";

const roleFallbackWeights: Record<string, Record<AbilityKey, number>> = {
  ai_product_manager: {
    aiTooling: 0.2,
    roleFoundation: 0.2,
    dataAnalysis: 0.12,
    businessProduct: 0.24,
    communication: 0.16,
    projectPractice: 0.08,
  },
  data_analyst: {
    aiTooling: 0.12,
    roleFoundation: 0.18,
    dataAnalysis: 0.32,
    businessProduct: 0.16,
    communication: 0.1,
    projectPractice: 0.12,
  },
  aigc_operator: {
    aiTooling: 0.24,
    roleFoundation: 0.18,
    dataAnalysis: 0.12,
    businessProduct: 0.16,
    communication: 0.12,
    projectPractice: 0.18,
  },
};

/** 权重是否为有限非负数（避免 NaN/非法权重导致分数失真）。 */
function isFiniteWeight(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** 归一化权重并求和；非法/缺失权重丢弃。返回 null 表示无有效权重。 */
export function normalizeWeights(raw: Record<string, number> | undefined): Record<AbilityKey, number> | null {
  if (!raw) return null;
  const cleaned: Partial<Record<AbilityKey, number>> = {};
  for (const [key, weight] of Object.entries(raw)) {
    if (isFiniteWeight(weight)) cleaned[key as AbilityKey] = weight;
  }
  return Object.keys(cleaned).length ? cleaned as Record<AbilityKey, number> : null;
}

export interface MatchDimension {
  key: AbilityKey;
  label: string;
  /** 已记录能力值（0 仅当真实记录为 0 才出现）；无记录则不出现 */
  value?: number;
  weight: number;
  /** 加权补弱优先级：weight * (100 - value)，仅对已记录维度有意义 */
  gap?: number;
}

export function calculateMatchScore(weights: Record<AbilityKey, number>, scores: Partial<Record<AbilityKey, number>>): {
  score: number | null;
  unassessed: AbilityKey[];
  breakdown: MatchDimension[];
} {
  const breakdown: MatchDimension[] = [];
  const unassessed: AbilityKey[] = [];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [keyStr, weight] of Object.entries(weights)) {
    const key = keyStr as AbilityKey;
    const value = scores[key];
    // 没有任何能力记录 → 视为“未评估”，不计入分数，不兜底为 0
    if (value === undefined || value === null || !Number.isFinite(value)) {
      unassessed.push(key);
      breakdown.push({ key, label: abilityLabels[key] ?? key, weight });
      continue;
    }
    weightedSum += value * weight;
    totalWeight += weight;
    breakdown.push({
      key,
      label: abilityLabels[key] ?? key,
      value,
      weight,
      gap: weight * (100 - value),
    });
  }

  // 无任何已记录能力或总权重为 0 → 信息不足，分数为 null（不臆造 0）
  const score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
  return { score, unassessed, breakdown };
}

export async function calculateMatch(profile: ProfileDto) {
  if (!profile.targetRole || !profile.targetRoleLabel) return null;

  const template = await getPrisma().roleTemplate.findUnique({
    where: { roleKey: profile.targetRole },
  });

  // 从模板解析权重；非法/缺失权重丢弃；无模板则种子回退；都没有返回 null
  let weights: Record<AbilityKey, number> | null = null;
  if (template?.abilityWeights) {
    try {
      weights = normalizeWeights(JSON.parse(template.abilityWeights) as Record<string, number>);
    } catch { /* ignore */ }
  }
  const effectiveWeights = weights ?? normalizeWeights(roleFallbackWeights[profile.targetRole]);
  if (!effectiveWeights) return null;

  const { score, unassessed, breakdown } = calculateMatchScore(effectiveWeights, profile.abilityScores);

  // 补弱优先级：按 weight * (100 - score) 排序（真实权重，非按最低分猜）
  const weakAbilities = breakdown
    .filter((d) => d.value !== undefined && d.gap !== undefined)
    .sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0))
    .slice(0, 3)
    .map((d) => d.key);

  if (score === null) {
    return {
      score: null,
      weakAbilities,
      unassessed,
      breakdown,
      hasInsufficientData: true,
      explanation: `基于 ${profile.targetRoleLabel} 岗位权重，目前还缺少部分能力记录，信息不足，暂不计算成长参考分。`,
    };
  }

  return {
    score,
    weakAbilities,
    unassessed,
    breakdown,
    hasInsufficientData: unassessed.length > 0,
    // “成长参考分 /100”，不写成“胜任概率/%”（plan 3.4 / F07）
    explanation: `${profile.targetRoleLabel} 成长参考分 ${score} / 100（基于已记录能力和岗位权重，供学习安排参考；${unassessed.length ? `另有 ${unassessed.length} 项能力待评估` : "暂无缺失维度"}）。`,
  };
}

export function buildCareerPlan(profile: ProfileDto): CareerPlan {
  const roleName = profile.targetRoleLabel ?? "未设置目标岗位";
  const hours = profile.weeklyAvailableHours ?? 5; // 未设置时默认 5 小时
  const intensity =
    hours <= 3 ? "轻量节奏" : hours >= 8 ? "强化节奏" : "稳定节奏";
  const months = Array.from({ length: 36 }, (_, index) => {
    const stage = index < 6 ? "基础建立" : index < 18 ? "作品集强化" : index < 30 ? "真实场景演练" : "求职与长期成长";
    const learningTasks: Array<{
      id: string;
      title: string;
      type: "learn" | "practice";
      status: "in_progress" | "not_started";
      dueWeek: number;
    }> = [
      {
        id: `m${index + 1}_learn`,
        title: `${intensity}学习：完成一个 ${roleName} 关键知识点`,
        type: "learn",
        status: index === 0 ? "in_progress" : "not_started",
        dueWeek: 2,
      },
      {
        id: `m${index + 1}_practice`,
        title: "沉淀一个可展示的小产出",
        type: "practice",
        status: "not_started",
        dueWeek: 4,
      },
    ];
    return {
      monthIndex: index + 1,
      goal: `${stage}：推进 ${roleName} 第 ${index + 1} 月任务`,
      learningTasks,
      practiceOutputs: ["学习笔记", "项目截图/分析报告", "复盘记录"],
      evaluationMetrics: ["能否解释产出目标", "能否说明改进点", "是否按周推进"],
    };
  });

  return {
    years: [
      { yearIndex: 1, goal: `建立 ${roleName} 入门能力`, expectedOutputs: ["完成 2 个基础项目", "形成学习笔记"] },
      { yearIndex: 2, goal: `形成 ${roleName} 作品集`, expectedOutputs: ["完成 1 个综合项目", "完成模拟训练"] },
      { yearIndex: 3, goal: `具备独立承担 ${roleName} 任务能力`, expectedOutputs: ["完善作品集", "准备实习/求职材料"] },
    ],
    quarters: Array.from({ length: 12 }, (_, index) => ({
      quarterIndex: index + 1,
      goal: `Q${index + 1}：${index < 4 ? "基础能力" : index < 8 ? "项目产出" : "岗位准备"}`,
      milestone: index < 4 ? "补齐基础并完成小练习" : index < 8 ? "完成作品集模块" : "准备面试和真实协作场景",
      evaluation: "至少完成 1 个可展示产出并写复盘。",
    })),
    months,
    currentMonth: months[0],
    assumptions: [
      `每周可投入时间按 ${profile.weeklyAvailableHours} 小时估算`,
      "计划基于当前画像生成，目标变化后可重规划",
    ],
    riskNotes: ["若连续两周无法推进，应降低任务密度", "AI 建议仅供参考，不替代自主决策"],
  };
}

export function buildSimulationFeedback(input: {
  scenarioKey: string;
  scenarioTitle: string;
  userAnswer: string;
}) {
  const clarityBonus = input.userAnswer.length > 80 ? 10 : input.userAnswer.length > 30 ? 5 : 0;
  const score = Math.min(92, 68 + clarityBonus);
  return {
    score,
    strengths: ["能围绕目标任务表达想法", "已经开始关注执行产出"],
    improvements: ["下一轮回答可补充量化指标", "建议明确风险、依赖和下一步负责人"],
    abilityImpact: {
      communication: ["cross_role_communication", "requirement_clarification"].includes(input.scenarioKey) ? 4 : 2,
      projectPractice: ["remote_collaboration", "ai_office"].includes(input.scenarioKey) ? 4 : 2,
      aiTooling: input.scenarioKey === "ai_office" ? 4 : 1,
      dataAnalysis: input.scenarioKey === "data_driven_decision" ? 4 : 1,
      businessProduct: ["requirement_clarification", "data_driven_decision"].includes(input.scenarioKey) ? 3 : 1,
      roleFoundation: 1,
    },
    profileUpdateCandidate: {
      field: "abilityScores.communication",
      newValue: score,
      confidence: 0.76,
      reason: `用户在「${input.scenarioTitle}」训练中完成了结构化表达，建议提升沟通协作评分。`,
    },
  };
}

export function serializePlan(plan: {
  years: unknown;
  quarters: unknown;
  months: unknown;
  assumptions: unknown;
  riskNotes: unknown;
}) {
  return {
    years: toJson(plan.years),
    quarters: toJson(plan.quarters),
    months: toJson(plan.months),
    assumptions: toJson(plan.assumptions),
    riskNotes: toJson(plan.riskNotes),
  };
}
