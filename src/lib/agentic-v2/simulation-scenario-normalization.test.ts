import { describe, expect, it } from "vitest";
import { simulationScenarioDataSchema } from "./contracts";
import { normalizeSimulationScenarioArtifactData } from "./simulation-scenario-normalization";

describe("simulation_scenario 兼容归一化", () => {
  it("把 prompts、scoringDimensions 和 skills 的对象数组提取为字符串数组", () => {
    const artifact = {
      schemaVersion: "1.0",
      taskType: "simulation_scenario",
      status: "success",
      summary: "场景",
      data: {
        sourceType: "custom",
        sourceRef: null,
        scenarioSnapshot: {
          key: "custom",
          title: "需求范围沟通",
          difficulty: "L2",
          durationMinutes: 8,
          skills: [{ name: "沟通协作" }, "需求分析"],
          role: "AI 产品经理",
          counterpart: "业务负责人",
          objective: "对齐范围与延期风险",
          brief: "需求范围临时扩大。",
          openingMessage: "请先说明优先级。",
          prompts: [
            { round: 1, hint: "先澄清优先级", expectedBehavior: "主动确认业务价值" },
            { prompt: "请给出备选方案。" },
          ],
          scoringDimensions: [
            { dimension: "需求表达", description: "能否说清优先级" },
            { name: "风险意识" },
          ],
        },
      },
      evidence: [],
      sources: [],
      assumptions: [],
      warnings: [],
      requiresUserConfirmation: false,
      baseVersion: null,
      nextActions: [],
    };

    const normalized = normalizeSimulationScenarioArtifactData(artifact);
    const parsed = simulationScenarioDataSchema.safeParse(
      (normalized as { data?: unknown }).data,
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.scenarioSnapshot.prompts).toEqual([
      "先澄清优先级；主动确认业务价值",
      "请给出备选方案。",
    ]);
    expect(parsed.data.scenarioSnapshot.scoringDimensions).toEqual(["需求表达", "风险意识"]);
    expect(parsed.data.scenarioSnapshot.skills).toEqual(["沟通协作", "需求分析"]);
  });

  it("保留已经是字符串数组的字段不变", () => {
    const artifact = {
      data: {
        scenarioSnapshot: {
          prompts: ["a"],
          scoringDimensions: ["b"],
          skills: ["c"],
        },
      },
    };
    const normalized = normalizeSimulationScenarioArtifactData(artifact) as typeof artifact;
    expect(normalized.data.scenarioSnapshot).toEqual({
      prompts: ["a"],
      scoringDimensions: ["b"],
      skills: ["c"],
    });
  });

  it("兼容根层 scenarioSnapshot 并补齐调用方已提供的 source 元数据", () => {
    const artifact = {
      schemaVersion: "1.0",
      taskType: "simulation_scenario",
      status: "success",
      scenarioSnapshot: {
        key: "custom",
        title: "需求沟通",
        difficulty: "L2",
        durationMinutes: 8,
        skills: ["沟通"],
        role: "AI 产品经理",
        counterpart: "业务负责人",
        objective: "对齐优先级",
        brief: "范围临时扩大。",
        openingMessage: "请先说明优先级。",
        prompts: ["先澄清业务价值"],
        scoringDimensions: ["需求表达"],
      },
    };
    const normalized = normalizeSimulationScenarioArtifactData(artifact, {
      sourceType: "custom",
      sourceRef: null,
    });
    const parsed = simulationScenarioDataSchema.safeParse(
      (normalized as { data?: unknown }).data,
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.sourceType).toBe("custom");
    expect(parsed.data.sourceRef).toBeNull();
    expect((normalized as { summary?: string }).summary).toBe("需求沟通");
    expect((normalized as { requiresUserConfirmation?: boolean }).requiresUserConfirmation).toBe(false);
    expect((normalized as { baseVersion?: number | null }).baseVersion).toBeNull();
  });
});
