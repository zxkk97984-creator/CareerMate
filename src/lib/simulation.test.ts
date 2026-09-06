import { describe, expect, it } from "vitest";
import {
  buildCareerInterviewScenario,
  canCompleteSimulation,
  formatAbilityImpact,
  getSimulationScenario,
  impactBarPercent,
  listSimulationScenarios,
  nextSimulationPrompt,
  parseSimulationTranscript,
  scenarioMetaForSession,
  simulationScenarioKeys,
} from "./simulation";

describe("simulation domain", () => {
  it("defines the documented scenario enum, including the dynamic career interview", () => {
    // career_interview 是依赖用户画像动态构建的岗位面试场景，包含在枚举中，
    // 但不出现在通用 listSimulationScenarios() 目录里（由 buildCareerInterviewScenario 单独构建）。
    expect(simulationScenarioKeys).toEqual([
      "cross_role_communication",
      "ai_office",
      "remote_collaboration",
      "data_driven_decision",
      "requirement_clarification",
      "career_interview",
    ]);
  });

  it("lists the five selectable scenarios and verifies each has complete metadata", () => {
    const catalog = listSimulationScenarios();
    expect(catalog).toHaveLength(5);
    for (const scenario of catalog) {
      expect(scenario.openingMessage.length).toBeGreaterThan(10);
      expect(scenario.brief.length).toBeGreaterThan(20);
      expect(scenario.objective.length).toBeGreaterThan(10);
      expect(scenario.difficulty).toMatch(/^L[123]$/);
      expect(scenario.durationMinutes).toBeGreaterThan(0);
      expect(scenario.skills.length).toBeGreaterThan(0);
      expect(scenario.scoringDimensions.length).toBeGreaterThanOrEqual(3);
      expect(scenario.prompts.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("builds a profile-aware career interview scenario with complete metadata", () => {
    const scenario = buildCareerInterviewScenario({ targetRole: "data_analyst", targetRoleLabel: "数据分析师" });
    expect(scenario.key).toBe("career_interview");
    expect(scenario.title).toBe("数据分析师 岗位面试");
    expect(scenario.role).toBe("数据分析师");
    expect(scenario.counterpart).toBe("面试官");
    expect(scenario.difficulty).toBe("L2");
    expect(scenario.prompts.length).toBeGreaterThanOrEqual(5);
    expect(scenario.scoringDimensions.length).toBeGreaterThanOrEqual(3);
    expect(scenario.openingMessage).toContain("数据分析师");
    // 通用目录不应把动态面试场景当作可预选场景
    expect(listSimulationScenarios().some((s) => s.key === "career_interview")).toBe(false);
  });

  it("allows completion from three through six user turns", () => {
    expect(canCompleteSimulation(2)).toBe(false);
    expect(canCompleteSimulation(3)).toBe(true);
    expect(canCompleteSimulation(6)).toBe(true);
    expect(canCompleteSimulation(7)).toBe(false);
  });

  it("parses stored transcripts safely", () => {
    expect(parseSimulationTranscript("null")).toEqual([]);
    expect(parseSimulationTranscript('{"bad":true}')).toEqual([]);
    expect(parseSimulationTranscript(JSON.stringify([
      { role: "assistant", content: "hello" },
      { role: "system", content: "private" },
      { role: "user", content: "answer" },
    ]))).toEqual([
      { role: "assistant", content: "hello" },
      { role: "user", content: "answer" },
    ]);
  });

  it("provides deterministic turn-specific prompts", () => {
    expect(nextSimulationPrompt("ai_office", 1)).not.toBe(nextSimulationPrompt("ai_office", 2));
    expect(nextSimulationPrompt("data_driven_decision", 3)).toContain("?");
  });

  it("returns scenario metadata via getSimulationScenario", () => {
    const scenario = getSimulationScenario("requirement_clarification");
    expect(scenario.key).toBe("requirement_clarification");
    expect(scenario.skills).toContain("communication");
    expect(scenario.scoringDimensions.length).toBeGreaterThanOrEqual(3);
  });
});

describe("scenarioMetaForSession（T17a：brief 与会话场景对应）", () => {
  const available = listSimulationScenarios();

  it("maps a session to its own scenario by scenarioKey, not the first default item", () => {
    const session = { scenarioKey: "data_driven_decision" };
    const meta = scenarioMetaForSession(session, available);
    expect(meta?.key).toBe("data_driven_decision");
    // 且它不是列表第一项（避免拿默认第一项冒充）
    expect(meta?.key).not.toBe(available[0].key);
  });

  it("returns null when the session targets a scenario not in the available list", () => {
    expect(scenarioMetaForSession({ scenarioKey: "career_interview" }, available)).toBeNull();
  });

  it("returns null when the session has no scenario key", () => {
    expect(scenarioMetaForSession({}, available)).toBeNull();
  });
});

describe("报告展示（T17b：null 分数与实际来源）", () => {
  it("formats ability impact so a negative value does not render '+-2'", () => {
    expect(formatAbilityImpact(2)).toBe("+2");
    expect(formatAbilityImpact(-2)).toBe("-2");
    expect(formatAbilityImpact(0)).toBe("0");
    expect(formatAbilityImpact(Number.NaN)).toBe("0");
  });

  it("maps impact magnitude to a non-negative bar width", () => {
    expect(impactBarPercent(2)).toBe(40);
    expect(impactBarPercent(-2)).toBe(40);
    expect(impactBarPercent(Number.NaN)).toBe(0);
    expect(impactBarPercent(0)).toBe(0);
    // 超限截断
    expect(impactBarPercent(100)).toBe(100);
  });
});
