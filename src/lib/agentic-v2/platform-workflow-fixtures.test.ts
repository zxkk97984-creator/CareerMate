import { describe, expect, it } from "vitest";
import { validatedAgentArtifactV1Schema } from "./contracts";
import { assertPlanDataQuality } from "@/lib/plans/task-model";
import { assertLearningRouteDataQuality } from "@/lib/plans/learning-route-quality";

const concreteAction = (id: string) => ({
  id,
  title: "完成 5 道 SQL 聚合查询",
  description: "使用公开销售数据完成查询并记录过滤逻辑",
  type: "practice",
  status: "not_started",
  estimatedHours: 4,
  resources: [],
  outputs: ["5 道查询结果与说明"],
  acceptanceCriteria: ["能解释每个查询的分组和过滤条件"],
});

const plan = {
  schemaVersion: 2,
  title: "数据分析师计划",
  targetRole: { key: "data_analyst", label: "数据分析师" },
  summary: "完成一次可复现的分析练习",
  horizon: { value: 4, unit: "week" },
  phases: [{
    id: "phase-1",
    title: "查询基础",
    objective: "掌握 SQL 聚合查询",
    duration: { value: 4, unit: "week" },
    skills: ["SQL"],
    actions: [concreteAction("action-1")],
    outputs: ["5 道查询结果与说明"],
    evaluationCriteria: ["能解释每个查询的分组和过滤条件"],
    risks: [],
  }],
  immediateActions: [],
  assumptions: [],
  riskNotes: [],
  evidenceRefs: [],
};

function artifact(taskType: string, data: unknown, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1.0",
    taskType,
    status: "pending_confirmation",
    summary: `${taskType} fixture`,
    data,
    evidence: [],
    sources: [],
    assumptions: [],
    warnings: [],
    requiresUserConfirmation: true,
    baseVersion: 3,
    nextActions: [],
    ...overrides,
  };
}

const fixtures: Array<{ name: string; value: unknown; qualityGate?: boolean }> = [
  {
    name: "profile_assessment",
    value: artifact("profile_assessment", {
      abilityEvidence: [{
        abilityKey: "dataAnalysis",
        summary: "课程项目中完成数据清洗和可视化",
        sourceType: "course_project",
        confidence: 0.75,
      }],
    }),
  },
  {
    name: "career_exploration",
    value: artifact("career_exploration", {
      options: [{ roleName: "数据分析师", roleKey: "data_analyst" }],
      recommendedOrder: ["data_analyst"],
      risks: [],
      validationExperiments: ["完成一页分析报告"],
    }, { status: "success", requiresUserConfirmation: false, baseVersion: null }),
  },
  { name: "career_plan", value: artifact("career_plan", { plan }), qualityGate: true },
  {
    name: "learning_route",
    value: artifact("learning_route", {
      targetRole: "data_analyst",
      weeklyBudgetHours: 6,
      period: "4周",
      stages: [{ title: "查询基础", description: "完成练习", tasks: [{ ...concreteAction("route-1") }] }],
      tasks: [{ ...concreteAction("route-1") }],
      resources: [],
      deliverables: ["查询记录"],
      acceptanceCriteria: ["能解释查询依据"],
      adjustmentTriggers: ["连续两周未完成"],
      baseRouteVersion: null,
    }),
  },
  {
    name: "simulation_turn",
    value: artifact("simulation_turn", {
      sessionId: "sim-1",
      scenarioKey: "career_interview",
      round: 2,
      nextQuestion: "你如何验证方案有效？",
      isComplete: false,
    }, { status: "success", requiresUserConfirmation: false, baseVersion: null }),
  },
  {
    name: "simulation_report",
    value: artifact("simulation_report", {
      sessionId: "sim-1",
      scenarioKey: "career_interview",
      score: 65,
      strengths: ["能先说明背景"],
      improvements: ["补充验证方法"],
      evidence: ["第 1 轮回答：先确认业务目标"],
      abilityImpact: { communication: 65 },
      candidateUpdates: [],
    }, { status: "success", requiresUserConfirmation: true, baseVersion: null }),
  },
  {
    name: "simulation_report_pending",
    value: artifact("simulation_report", {
      abilityEvidence: [{
        abilityKey: "communication",
        summary: "先确认目标再解释方案",
        sourceType: "simulation",
        sourceRef: "sim-1",
        confidence: 0.65,
      }],
    }),
  },
  {
    name: "growth_review",
    value: artifact("growth_review", {
      plan,
      planPatch: { parentPlanId: "plan-old" },
    }),
    qualityGate: true,
  },
  {
    name: "resume_review",
    value: artifact("resume_review", {
      abilityEvidence: [{
        abilityKey: "projectPractice",
        summary: "独立完成电商转化漏斗分析项目",
        sourceType: "resume",
        sourceRef: "project-1",
        confidence: 0.9,
      }],
    }),
  },
  {
    name: "simulation_scenario",
    value: artifact("simulation_scenario", {
      sourceType: "custom",
      sourceRef: null,
      scenarioSnapshot: {
        key: "custom",
        title: "项目延期沟通",
        difficulty: "L2",
        durationMinutes: 8,
        skills: ["communication"],
        role: "项目协调人",
        counterpart: "跨部门负责人",
        objective: "同步风险和下一步",
        brief: "项目关键依赖延期。",
        openingMessage: "请先说明事实和下一步。",
        prompts: ["请补充判断依据。"],
        scoringDimensions: ["事实清晰", "推进能力"],
      },
    }, { status: "success", requiresUserConfirmation: false, baseVersion: null }),
  },
];

describe("platform workflow fixtures", () => {
  it.each(fixtures)("$name matches the backend artifact contract", ({ name, value, qualityGate }) => {
    const result = validatedAgentArtifactV1Schema.safeParse(value);
    expect(result.success, JSON.stringify(result.success ? [] : result.error.issues)).toBe(true);
    if (qualityGate) expect(() => assertPlanDataQuality((value as { data: unknown }).data)).not.toThrow();
    if (name === "learning_route") {
      expect(() => assertLearningRouteDataQuality((value as { data: unknown }).data)).not.toThrow();
    }
  });
});
