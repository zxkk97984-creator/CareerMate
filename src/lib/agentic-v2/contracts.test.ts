import { describe, expect, it } from "vitest";
import {
  agentArtifactV1Schema,
  validatedAgentArtifactV1Schema,
  businessDataV1Schema,
  evidenceBundleV1Schema,
  researchReportV1Schema,
  reviewReportV1Schema,
} from "./contracts";

const marketEvidence = {
  searched: true,
  skipReason: null,
  collectedAt: "2026-07-21T00:00:00.000Z",
  scope: { region: "CN", experienceLevel: "entry", timeRange: "2026-Q3" },
  findings: [],
  sources: [],
  conflicts: [],
  confidence: "medium",
};

function withoutData(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "data"));
}

describe("Agentic V2 platform contracts", () => {
  it("accepts the four-route evidence bundle specified by the platform plan", () => {
    const result = evidenceBundleV1Schema.safeParse({
      schemaVersion: "1.0",
      request: { action: "career_exploration" },
      profileSnapshot: { available: true, version: 7, data: { targetRole: "data_analyst" } },
      historySnapshot: { available: true, through: "message-9", data: [] },
      careerBaseline: { roleKey: "data_analyst", templateVersion: "2026.07", evidence: [] },
      marketEvidence,
    });
    expect(result.success).toBe(true);
  });

  it("requires an actual market search or a non-empty skip reason", () => {
    const common = {
      schemaVersion: "1.0",
      request: {},
      profileSnapshot: { available: false, version: null, data: null },
      historySnapshot: { available: false, through: null, data: null },
      careerBaseline: { roleKey: "data_analyst", templateVersion: "2026.07", evidence: [] },
    };
    expect(evidenceBundleV1Schema.safeParse({
      ...common,
      marketEvidence: { ...marketEvidence, searched: false, skipReason: null },
    }).success).toBe(false);
    expect(evidenceBundleV1Schema.safeParse({
      ...common,
      marketEvidence: {
        ...marketEvidence,
        searched: false,
        skipReason: "No market search requested",
        collectedAt: null,
      },
    }).success).toBe(true);
  });

  it("does not add availability metadata coupling beyond the platform plan", () => {
    const evidence = {
      schemaVersion: "1.0",
      request: {},
      profileSnapshot: { available: true, version: 1, data: {} },
      historySnapshot: { available: true, through: "message-1", data: [] },
      careerBaseline: { roleKey: "data_analyst", templateVersion: "2026.07", evidence: [] },
      marketEvidence,
    };

    expect(evidenceBundleV1Schema.safeParse({
      ...evidence,
      profileSnapshot: { available: false, version: 1, data: {} },
    }).success).toBe(true);
    expect(evidenceBundleV1Schema.safeParse({
      ...evidence,
      historySnapshot: { available: true, through: null, data: [] },
    }).success).toBe(true);
    expect(evidenceBundleV1Schema.safeParse({
      ...evidence,
      marketEvidence: { ...marketEvidence, searched: true, skipReason: "not searched" },
    }).success).toBe(true);
    expect(evidenceBundleV1Schema.safeParse({
      ...evidence,
      marketEvidence: { ...marketEvidence, searched: false, skipReason: "disabled", collectedAt: marketEvidence.collectedAt },
    }).success).toBe(true);
  });

  it("requires serializable JSON data in every snapshot and artifact", () => {
    const evidence = {
      schemaVersion: "1.0",
      request: {},
      profileSnapshot: { available: true, version: 1, data: {} },
      historySnapshot: { available: true, through: "message-1", data: [] },
      careerBaseline: { roleKey: "data_analyst", templateVersion: "2026.07", evidence: [] },
      marketEvidence,
    };
    const artifact = {
      schemaVersion: "1.0",
      taskType: "career_plan",
      status: "success",
      summary: "A plan was generated.",
      data: {},
      evidence: [],
      sources: [],
      assumptions: [],
      warnings: [],
      requiresUserConfirmation: false,
      baseVersion: 1,
      nextActions: [],
    };

    const withoutProfileData = withoutData(evidence.profileSnapshot);
    const withoutHistoryData = withoutData(evidence.historySnapshot);
    const withoutArtifactData = withoutData(artifact);

    expect(evidenceBundleV1Schema.safeParse({
      ...evidence,
      profileSnapshot: withoutProfileData,
    }).success).toBe(false);
    expect(evidenceBundleV1Schema.safeParse({
      ...evidence,
      historySnapshot: withoutHistoryData,
    }).success).toBe(false);
    expect(agentArtifactV1Schema.safeParse(withoutArtifactData).success).toBe(false);
    expect(evidenceBundleV1Schema.safeParse({
      ...evidence,
      profileSnapshot: { ...evidence.profileSnapshot, data: new Date() },
    }).success).toBe(false);
    expect(agentArtifactV1Schema.safeParse({ ...artifact, data: () => "not JSON" }).success).toBe(false);
  });

  it("rejects non-JSON values without imposing arbitrary JSON content limits", () => {
    const sparse = new Array(1);
    let tooDeep: unknown = null;
    for (let index = 0; index < 13; index += 1) tooDeep = { nested: tooDeep };

    const evidence = {
      schemaVersion: "1.0",
      request: { action: "career_exploration" },
      profileSnapshot: { available: true, version: 1, data: {} },
      historySnapshot: { available: true, through: "message-1", data: [] },
      careerBaseline: { roleKey: "data_analyst", templateVersion: "2026.07", evidence: [] },
      marketEvidence,
    };
    const artifact = {
      schemaVersion: "1.0",
      taskType: "career_plan",
      status: "success",
      summary: "A plan was generated.",
      data: {},
      evidence: [],
      sources: [],
      assumptions: [],
      warnings: [],
      requiresUserConfirmation: false,
      baseVersion: 1,
      nextActions: [],
    };

    expect(evidenceBundleV1Schema.safeParse({ ...evidence, request: { when: new Date() } }).success).toBe(false);
    expect(evidenceBundleV1Schema.safeParse({
      ...evidence,
      careerBaseline: { ...evidence.careerBaseline, evidence: [() => "not JSON"] },
    }).success).toBe(false);
    expect(evidenceBundleV1Schema.safeParse({
      ...evidence,
      marketEvidence: { ...marketEvidence, findings: sparse },
    }).success).toBe(false);
    expect(agentArtifactV1Schema.safeParse({ ...artifact, sources: [tooDeep] }).success).toBe(true);
    expect(agentArtifactV1Schema.safeParse({ ...artifact, warnings: ["x".repeat(10_001)] }).success).toBe(true);
    expect(() => agentArtifactV1Schema.safeParse({ ...artifact, nextActions: [tooDeep] })).not.toThrow();
  });

  it("accepts only platform-plan artifact task types and statuses, with optional id", () => {
    const value = {
      schemaVersion: "1.0",
      taskType: "learning_route",
      status: "pending_confirmation",
      summary: "Confirm the proposed learning route.",
      data: { weeks: 12 },
      evidence: [],
      sources: [],
      assumptions: [],
      warnings: [],
      requiresUserConfirmation: true,
      baseVersion: null,
      nextActions: [],
    };
    expect(agentArtifactV1Schema.safeParse(value).success).toBe(true);
    expect(agentArtifactV1Schema.safeParse({ ...value, taskType: "research" }).success).toBe(false);
    expect(agentArtifactV1Schema.safeParse({ ...value, status: "draft" }).success).toBe(false);
    expect(agentArtifactV1Schema.safeParse({ ...value, baseVersion: "3" }).success).toBe(false);
  });

  it("keeps research reports independent from private evidence bundles", () => {
    const value = {
      schemaVersion: "1.0",
      topic: "Entry-level data analyst roles",
      collectedAt: "2026-07-21T00:00:00.000Z",
      queryScope: { region: "CN", experienceLevel: "entry", timeRange: "2026-Q3" },
      findings: [],
      sources: [],
      conflicts: [],
      confidence: "high",
      limitations: [],
    };
    expect(researchReportV1Schema.safeParse(value).success).toBe(true);
    expect(researchReportV1Schema.safeParse({ ...value, evidence: marketEvidence }).success).toBe(false);
  });

  it("validates the platform review verdict and required decision fields", () => {
    const value = {
      schemaVersion: "1.0",
      verdict: "revise",
      issues: [],
      requiredChanges: ["Add a source for salary expectations."],
      riskFlags: [],
      confirmationRequired: true,
    };
    expect(reviewReportV1Schema.safeParse(value).success).toBe(true);
    expect(reviewReportV1Schema.safeParse({ ...value, verdict: "approved" }).success).toBe(false);
    expect(reviewReportV1Schema.safeParse({ verdict: "pass", issues: [], requiredChanges: [], riskFlags: [] }).success).toBe(false);
  });

  it("accepts the new snapshot-based business_data with profile and history", () => {
    const businessData = {
      schemaVersion: "1",
      interaction: {
        surface: "career_path",
        action: "regenerate_plan",
        targetRef: "plan-1",
      },
      profileSnapshot: {
        available: true,
        version: 5,
        data: {
          targetRole: "data_analyst",
          weeklyAvailableHours: 8,
          abilityScores: { dataAnalysis: 62 },
          abilityEvidence: [],
        },
      },
      historySnapshot: {
        available: true,
        through: "2026-07-23T08:00:00.000Z",
        data: {
          activePlan: { id: "plan-1", version: 3, targetRole: "data_analyst" },
          recentProgress: [],
          recentSimulations: [],
          confirmedMemories: [],
          conversationSummary: "",
        },
      },
      simulationState: null,
      permissions: {
        candidateCreationAllowed: true,
        officialWritesAllowed: false,
      },
    };

    expect(businessDataV1Schema.parse(businessData)).toEqual(businessData);
  });

  it("rejects careermate_context_token in the snapshot-based contract", () => {
    const businessData = {
      schemaVersion: "1",
      interaction: {
        surface: "career_path",
        action: "regenerate_plan",
        targetRef: "plan-1",
      },
      profileSnapshot: {
        available: true,
        version: 5,
        data: { targetRole: "data_analyst" },
      },
      historySnapshot: {
        available: true,
        through: "2026-07-23T08:00:00.000Z",
        data: { activePlan: { id: "plan-1", version: 3, targetRole: "data_analyst" } },
      },
      simulationState: null,
      permissions: {
        candidateCreationAllowed: true,
        officialWritesAllowed: false,
      },
      careermate_context_token: "must-not-be-active",
    };

    expect(businessDataV1Schema.safeParse(businessData).success).toBe(false);
  });
});

// ── 工作流 data 精确 Schema 合法/非法 fixture 测试 ──────────────

function artifactFixture(taskType: string, data?: Record<string, unknown>) {
  return {
    schemaVersion: "1.0" as const,
    taskType,
    status: "pending_confirmation" as const,
    summary: "测试 artifact",
    data: data ?? {},
    evidence: [],
    sources: [],
    assumptions: [],
    warnings: [],
    requiresUserConfirmation: true,
    baseVersion: 1 as number | null,
    nextActions: [],
  };
}

describe("AgentArtifact V1 discriminated union (per-taskType data schema)", () => {
  // ── profile_assessment / profile_patch ──
  it("profile_assessment: accepts valid patch data", () => {
    const r = validatedAgentArtifactV1Schema.safeParse(artifactFixture("profile_assessment", {
      patch: { experienceSummary: "有产品实习经验", weeklyAvailableHours: 8 },
    }));
    expect(r.success).toBe(true);
  });

  it("profile_assessment: rejects missing patch wrapper", () => {
    const r = validatedAgentArtifactV1Schema.safeParse(artifactFixture("profile_assessment", {
      experienceSummary: "直接放字段而非嵌套 patch",
    }));
    expect(r.success).toBe(false);
  });

  it("profile_assessment: rejects empty patch", () => {
    const r = validatedAgentArtifactV1Schema.safeParse(artifactFixture("profile_assessment", {
      patch: {},
    }));
    expect(r.success).toBe(false);
  });

  // ── simulation_report / ability_evidence ──
  it("simulation_report: accepts valid abilityEvidence array", () => {
    const r = validatedAgentArtifactV1Schema.safeParse(artifactFixture("simulation_report", {
      abilityEvidence: [{ abilityKey: "communication", summary: "表现优异", sourceType: "simulation", confidence: 0.85 }],
    }));
    expect(r.success).toBe(true);
  });

  it("simulation_report: rejects missing abilityEvidence", () => {
    const r = validatedAgentArtifactV1Schema.safeParse(artifactFixture("simulation_report", {
      score: 85,
    }));
    expect(r.success).toBe(false);
  });

  it("simulation_report: rejects empty abilityEvidence array", () => {
    const r = validatedAgentArtifactV1Schema.safeParse(artifactFixture("simulation_report", {
      abilityEvidence: [],
    }));
    expect(r.success).toBe(false);
  });

  // ── resume_review / ability_evidence ──
  it("resume_review: accepts valid abilityEvidence", () => {
    const r = validatedAgentArtifactV1Schema.safeParse(artifactFixture("resume_review", {
      abilityEvidence: [{ abilityKey: "projectPractice", summary: "作品集质量高", sourceType: "resume", confidence: 0.9 }],
    }));
    expect(r.success).toBe(true);
  });

  // ── career_plan ──
  it("career_plan: accepts valid plan data with aiCareerPlanV2Schema", () => {
    const r = validatedAgentArtifactV1Schema.safeParse(artifactFixture("career_plan", {
      plan: {
        schemaVersion: 2,
        title: "AI 产品经理 3 年成长计划",
        targetRole: { key: "ai_product_manager", label: "AI 产品经理" },
        summary: "3 年成长为高级 AI 产品经理",
        horizon: { value: 3, unit: "year" },
        phases: [{ id: "p1", title: "基础期", objective: "建立基础", duration: { value: 6, unit: "month" }, skills: [], actions: [{ id: "a1", title: "完成 PRD 课程", description: "学习 PRD 基础", type: "learning", status: "not_started", resources: [] }], outputs: [], evaluationCriteria: [], risks: [] }],
        immediateActions: [],
        assumptions: [],
        riskNotes: [],
        evidenceRefs: [],
      },
    }));
    expect(r.success).toBe(true);
  });

  it("career_plan: rejects missing plan wrapper", () => {
    const r = validatedAgentArtifactV1Schema.safeParse(artifactFixture("career_plan", {
      targetRole: "ai_product_manager",
      phases: [{ name: "基础期" }],
    }));
    expect(r.success).toBe(false);
  });

  // ── learning_route ──
  it("learning_route: accepts valid route data", () => {
    const r = validatedAgentArtifactV1Schema.safeParse(artifactFixture("learning_route", {
      targetRole: "data_analyst",
      weeklyBudgetHours: 10,
      stages: [{ name: "SQL 基础", weeks: 4 }],
      baseRouteVersion: null,
    }));
    expect(r.success).toBe(true);
  });

  it("learning_route: rejects missing baseRouteVersion", () => {
    const r = validatedAgentArtifactV1Schema.safeParse(artifactFixture("learning_route", {
      targetRole: "data_analyst",
      weeklyBudgetHours: 10,
      stages: [{ name: "SQL 基础", weeks: 4 }],
    }));
    expect(r.success).toBe(false);
  });

  // ── growth_review / growth_replan ──
  it("growth_review: accepts valid replan data", () => {
    const r = validatedAgentArtifactV1Schema.safeParse(artifactFixture("growth_review", {
      plan: {
        schemaVersion: 2,
        title: "复盘后计划",
        targetRole: { key: "ai_product_manager", label: "AI 产品经理" },
        summary: "需要调整学习节奏",
        horizon: { value: 3, unit: "year" },
        phases: [{ id: "p1", title: "调整期", objective: "调整方向", duration: { value: 3, unit: "month" }, skills: [], actions: [{ id: "a1", title: "重新评估", description: "评估", type: "review", status: "not_started", resources: [] }], outputs: [], evaluationCriteria: [], risks: [] }],
        immediateActions: [],
        assumptions: [],
        riskNotes: [],
        evidenceRefs: [],
      },
      planPatch: { parentPlanId: "plan-1" },
    }));
    expect(r.success).toBe(true);
  });

  it("growth_review: rejects missing plan wrapper", () => {
    const r = validatedAgentArtifactV1Schema.safeParse(artifactFixture("growth_review", {
      summary: "没有完整计划的复盘",
    }));
    expect(r.success).toBe(false);
  });

  // ── 新补齐的精确 Schema ──
  it("memory_item: accepts valid data", () => {
    const r = validatedAgentArtifactV1Schema.safeParse(artifactFixture("memory_item", {
      content: "用户偏好自主学习", kind: "career_fact",
    }));
    expect(r.success).toBe(true);
  });

  it("memory_item: rejects missing content", () => {
    const r = validatedAgentArtifactV1Schema.safeParse(artifactFixture("memory_item", {
      kind: "career_fact",
    }));
    expect(r.success).toBe(false);
  });

  it("simulation_turn: accepts valid turn data", () => {
    const r = validatedAgentArtifactV1Schema.safeParse(artifactFixture("simulation_turn", {
      sessionId: "s1", scenarioKey: "cross_role_communication", round: 1, nextQuestion: "你的看法是？", isComplete: false,
    }));
    expect(r.success).toBe(true);
  });

  it("simulation_turn: rejects missing isComplete=false", () => {
    const r = validatedAgentArtifactV1Schema.safeParse(artifactFixture("simulation_turn", {
      sessionId: "s1", scenarioKey: "cross_role_communication", round: 1, nextQuestion: "你的看法是？",
    }));
    expect(r.success).toBe(false);
  });

  it("career_exploration: accepts valid exploration data", () => {
    const r = validatedAgentArtifactV1Schema.safeParse(artifactFixture("career_exploration", {
      options: [{ roleName: "数据分析师", roleKey: "data_analyst", fitScore: 72 }],
    }));
    expect(r.success).toBe(true);
  });

  it("career_exploration: rejects empty options", () => {
    const r = validatedAgentArtifactV1Schema.safeParse(artifactFixture("career_exploration", {
      options: [],
    }));
    expect(r.success).toBe(false);
  });
});
