import { getPrisma } from "@/lib/prisma";
import { toJson } from "@/lib/json";
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

export async function calculateMatch(profile: ProfileDto) {
  if (!profile.targetRole || !profile.targetRoleLabel) return null;

  const template = await getPrisma().roleTemplate.findUnique({
    where: { roleKey: profile.targetRole },
  });

  // 从模板解析权重；无模板则从种子回退表获取；都没有则返回 null
  let weights: Record<AbilityKey, number> | undefined;
  if (template?.abilityWeights) {
    try {
      weights = JSON.parse(template.abilityWeights) as Record<AbilityKey, number>;
    } catch { /* ignore */ }
  }
  const effectiveWeights = weights ?? roleFallbackWeights[profile.targetRole];
  if (!effectiveWeights) return null;

  const score = Object.entries(effectiveWeights).reduce((sum, [key, weight]) => {
    return sum + (profile.abilityScores[key as AbilityKey] ?? 0) * weight;
  }, 0);

  const weakAbilities = Object.entries(profile.abilityScores)
    .sort(([, a], [, b]) => a - b)
    .slice(0, 2)
    .map(([key]) => key as AbilityKey);

  return {
    score: Math.round(score),
    weakAbilities,
    explanation: `当前与 ${profile.targetRoleLabel} 的匹配度约为 ${Math.round(score)} 分，优先补齐 ${weakAbilities.join("、")} 相关能力。`,
  };
}

export function buildCareerPlan(profile: ProfileDto) {
  const roleName = profile.targetRoleLabel;
  const intensity =
    profile.weeklyAvailableHours <= 3 ? "轻量节奏" : profile.weeklyAvailableHours >= 8 ? "强化节奏" : "稳定节奏";
  const months = Array.from({ length: 36 }, (_, index) => {
    const stage = index < 6 ? "基础建立" : index < 18 ? "作品集强化" : index < 30 ? "真实场景演练" : "求职与长期成长";
    return {
      monthIndex: index + 1,
      goal: `${stage}：推进 ${roleName} 第 ${index + 1} 月任务`,
      learningTasks: [
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
      ],
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
      communication: input.scenarioKey === "cross_role_communication" ? 4 : 2,
      projectPractice: 2,
      aiTooling: input.scenarioKey === "ai_office" ? 4 : 1,
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
