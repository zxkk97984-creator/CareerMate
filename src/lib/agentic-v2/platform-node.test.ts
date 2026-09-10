import { describe, expect, it } from "vitest";
import { researchReportV1Schema } from "./contracts";
import { validatePlatformNode } from "./platform-node";
import { buildPlatformContractExample } from "./platform-contracts";

const envelope = (taskType: string, status: string, data: unknown) => ({ schemaVersion: "1.0", taskType, status, summary: "测试结果", data, evidence: [], sources: [], assumptions: [], warnings: [], requiresUserConfirmation: status === "pending_confirmation", baseVersion: null as number | null, nextActions: [] });
const event = (value: unknown) => ({ raw: JSON.stringify(value), ...buildPlatformContractExample() });

describe("platform code node", () => {
  it("returns an error rather than throwing for options object", () => {
    expect(validatePlatformNode(event(envelope("career_exploration", "success", { options: {} })), ["career_exploration"]).artifact.status).toBe("error");
  });
  it.each([null, {}, { status: "wrong" }])("rejects incomplete output %j", (value) => {
    expect(validatePlatformNode(event(value), ["career_exploration"]).artifact.status).toBe("error");
  });
  it("preserves needs_input for a simulation turn", () => {
    const value = envelope("simulation_turn", "needs_input", { question: "请提供本场会话" });
    expect(validatePlatformNode(event(value), ["simulation_turn", "simulation_report"]).artifact).toEqual(value);
  });
  it("preserves an upstream error code", () => {
    const value = envelope("simulation_report", "error", { code: "NO_ANSWERS", message: "没有可评分回答" });
    expect(validatePlatformNode(event(value), ["simulation_turn", "simulation_report"]).artifact).toEqual(value);
  });
  it("requires actual input bindings", () => {
    expect(validatePlatformNode({ raw: "{}" }, ["career_plan"]).artifact.data).toMatchObject({ code: "INVALID_WORKFLOW_INPUT" });
  });
  it("checks individual weeks, not only total period capacity", () => {
    const task = { id: "t1", weekIndex: 1, title: "完成 SQL 查询练习", description: "使用公开练习数据写出查询并核对结果", estimatedHours: 7, outputs: ["查询文件"], acceptanceCriteria: ["输出与预期一致"] };
    const value = envelope("learning_route", "pending_confirmation", { targetRole: "data_analyst", weeklyBudgetHours: 6, period: "4周", stages: [{ title: "查询基础", tasks: [task] }], tasks: [task], baseRouteVersion: null });
    const input = event(value);
    const context = JSON.parse(input.task_context_json);
    value.baseVersion = context.basePlanVersion;
    input.raw = JSON.stringify(value);
    const result = validatePlatformNode(input, ["learning_route"]);
    expect(result.artifact.data).toMatchObject({ code: "WEEKLY_BUDGET_EXCEEDED" });
    task.estimatedHours = 4;
    expect(validatePlatformNode(event(value), ["learning_route"]).artifact.status).toBe("pending_confirmation");
  });
});

describe("version and simulation boundaries", () => {
  const scenarioValue = () => envelope("simulation_scenario", "success", {
    sourceType: "custom",
    sourceRef: null,
    scenarioSnapshot: {
      key: "custom",
      title: "需求澄清训练",
      difficulty: "L2",
      durationMinutes: 8,
      skills: ["communication"],
      role: "AI 产品经理",
      counterpart: "业务负责人",
      objective: "练习需求澄清与优先级对齐",
      brief: "业务负责人临时要求缩短交付周期。",
      openingMessage: "请先说明你希望澄清的范围和优先级。",
      prompts: ["你会先确认哪个问题？"],
      scoringDimensions: ["需求表达", "推进能力"],
    },
  });

  it("extracts a simulation_scenario artifact from prose and a code fence", () => {
    const input = buildPlatformContractExample("simulation_scenario");
    const raw = `下面是工作流结果：\n\n\`\`\`json\n${JSON.stringify(scenarioValue())}\n\`\`\`\n请使用该结果。`;
    expect(validatePlatformNode({ ...input, raw }, ["simulation_scenario"]).artifact.status).toBe("success");
  });

  it("accepts an artifact wrapped in the CAREERMATE envelope tags", () => {
    const input = buildPlatformContractExample("simulation_scenario");
    const raw = `<CAREERMATE_ARTIFACT>\n${JSON.stringify(scenarioValue())}\n</CAREERMATE_ARTIFACT>`;
    expect(validatePlatformNode({ ...input, raw }, ["simulation_scenario"]).artifact.status).toBe("success");
  });

  it("accepts a structured raw object from the platform binding", () => {
    const input = buildPlatformContractExample("simulation_scenario");
    expect(validatePlatformNode({ ...input, raw: scenarioValue() }, ["simulation_scenario"]).artifact.status).toBe("success");
  });

  it("repairs common simulation_scenario JSON issues and normalizes object arrays", () => {
    const input = buildPlatformContractExample("simulation_scenario");
    const raw = '{"taskType":"simulation_scenario","status":"success","summary":"生成"测试"场景","scenarioSnapshot":{"key":"custom","title":"需求沟通","difficulty":"L2","durationMinutes":8,"skills":[{"name":"沟通"}],"role":"AI 产品经理","counterpart":"业务负责人","objective":"对齐优先级","brief":"范围临时扩大。","openingMessage":"请先说明优先级。","prompts":[{"hint":"先澄清业务价值"}],"scoringDimensions":[{"dimension":"需求表达"}]},"evidence":[],"sources":[],"assumptions":[],"warnings":[],"requiresUserConfirmation":false,"baseVersion":null,"nextActions":[]}';
    const result = validatePlatformNode(
      { ...input, raw },
      ["simulation_scenario"],
    );
    expect(result.artifact.status).toBe("success");
    expect(result.artifact.data).toMatchObject({
      sourceType: "custom",
      scenarioSnapshot: {
        prompts: ["先澄清业务价值"],
        scoringDimensions: ["需求表达"],
        skills: ["沟通"],
      },
    });
  });

  it("accepts first career plan without inventing a base version", () => {
    const input = buildPlatformContractExample("career_plan");
    const context = JSON.parse(input.task_context_json); context.basePlanVersion = null; context.activePlanId = null;
    const value = envelope("career_plan", "pending_confirmation", { plan: { schemaVersion: 2, title: "查询基础计划", targetRole: { key: "data_analyst", label: "数据分析师" }, summary: "练习查询", horizon: { value: 4, unit: "week" }, phases: [{ id: "p1", title: "基础查询", objective: "完成聚合查询", duration: { value: 4, unit: "week" }, skills: [], actions: [{ id: "a1", title: "完成 SQL 聚合查询", description: "写出并验证公开数据的聚合查询", type: "practice", status: "not_started", estimatedHours: 2, resources: [], outputs: ["查询文件"], acceptanceCriteria: ["结果正确"] }], outputs: [], evaluationCriteria: [], risks: [] }], immediateActions: [], assumptions: [], riskNotes: [], evidenceRefs: [] } });
    expect(validatePlatformNode({ ...input, task_context_json: JSON.stringify(context), raw: JSON.stringify(value) }, ["career_plan"]).artifact.status).toBe("pending_confirmation");
  });
  it("rejects wrong expected round with saved session", () => {
    const input = buildPlatformContractExample("simulation_turn");
    const context = JSON.parse(input.task_context_json);
    context.expectedRound = 2; context.simulationState = { sessionId: "sim-1", scenarioKey: "career_interview", round: 1, expectedRound: 2 };
    const value = envelope("simulation_turn", "success", { sessionId: "sim-1", scenarioKey: "career_interview", round: 3, nextQuestion: "请说明判断依据", isComplete: false });
    expect(validatePlatformNode({ ...input, task_context_json: JSON.stringify(context), raw: JSON.stringify(value) }, ["simulation_turn", "simulation_report"]).artifact.data).toMatchObject({ code: "ROUND_MISMATCH" });
  });
  it("rejects unsupported status", () => {
    expect(validatePlatformNode(event(envelope("career_plan", "completed", {})), ["career_plan"]).artifact.data).toMatchObject({ code: "INVALID_ARTIFACT_SCHEMA" });
  });
  it("rejects personal candidate without profile version", () => {
    const input = buildPlatformContractExample("profile_assessment");
    const context = JSON.parse(input.task_context_json); context.profileVersion = null;
    const evidence = JSON.parse(input.evidence_bundle_json); evidence.profileSnapshot.version = null;
    const value = envelope("profile_assessment", "pending_confirmation", { patch: { targetRole: "data_analyst" } });
    expect(validatePlatformNode({ ...input, task_context_json: JSON.stringify(context), evidence_bundle_json: JSON.stringify(evidence), raw: JSON.stringify(value) }, ["profile_assessment"]).artifact.data).toMatchObject({ code: "BASE_VERSION_REQUIRED" });
  });
});

it("research report preserves unknown collection time", () => {
  expect(researchReportV1Schema.safeParse({ schemaVersion: "1.0", topic: "岗位研究", collectedAt: null, queryScope: { region: "未指定", experienceLevel: "未指定", timeRange: "未指定" }, findings: [], sources: [], conflicts: [], confidence: "low", limitations: ["调用方未提供 currentTime"] }).success).toBe(true);
});

describe("weekly schedule consistency", () => {
  const task = (id: string, weekIndex: number) => ({ id, weekIndex, title: "完成 SQL 查询练习", description: "使用公开数据完成查询并记录验证结果", estimatedHours: 4, outputs: ["查询文件"], acceptanceCriteria: ["结果正确"] });
  function check(tasks: unknown[], flat: unknown[] = tasks) {
    const input = buildPlatformContractExample("learning_route");
    const context = JSON.parse(input.task_context_json);
    const value = envelope("learning_route", "pending_confirmation", { targetRole: "data_analyst", weeklyBudgetHours: 6, period: "4周", stages: [{ title: "查询基础", tasks }], tasks: flat, baseRouteVersion: null });
    value.baseVersion = context.basePlanVersion;
    return validatePlatformNode({ ...input, raw: JSON.stringify(value) }, ["learning_route"]).artifact;
  }
  it("accepts separate weeks", () => expect(check([task("a", 1), task("b", 2)]).status).toBe("pending_confirmation"));
  it("rejects duplicated IDs", () => expect(check([task("a", 1), task("a", 2)]).data).toMatchObject({ code: "INVALID_TASK_SCHEDULE" }));
  it("rejects a week outside period", () => expect(check([task("a", 5)]).data).toMatchObject({ code: "INVALID_TASK_SCHEDULE" }));
  it("rejects diverging flat task copy", () => expect(check([task("a", 1)], [task("a", 2)]).data).toMatchObject({ code: "TASK_LIST_MISMATCH" }));
});

it("identifies the invalid input field without echoing its contents", () => {
  const input = event(envelope("profile_assessment", "needs_input", { question: "请补充" }));
  input.evidence_bundle_json = "private broken json";
  const result = validatePlatformNode(input, ["profile_assessment"]).artifact;
  expect(result.data).toMatchObject({ code: "INVALID_WORKFLOW_INPUT" });
  expect(result.summary).toContain("evidence_bundle_json");
  expect(JSON.stringify(result)).not.toContain("private broken json");
});
it("distinguishes a missing model-output binding from malformed JSON", () => {
  const input = event(envelope("profile_assessment", "needs_input", { question: "请补充" }));
  expect(validatePlatformNode({ ...input, raw: undefined }, ["profile_assessment"]).artifact.data).toMatchObject({ code: "WORKFLOW_OUTPUT_MISSING" });
});
