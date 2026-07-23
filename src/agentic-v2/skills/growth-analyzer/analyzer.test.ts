import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeGrowthData, detectSensitiveFields } from "./analyzer";
import { growthAnalysisSchema } from "./schema";

function loadExample(name: string): unknown {
  const raw = readFileSync(
    join(__dirname, "examples", `${name}.json`),
    "utf-8",
  );
  return JSON.parse(raw);
}

describe("CareerMate成长数据分析", () => {
  // ---- Schema 验证 ----

  it("正常输入产出合法的 GrowthAnalysis", () => {
    const input = loadExample("normal");
    const result = analyzeGrowthData(input as Parameters<typeof analyzeGrowthData>[0]);
    const parsed = growthAnalysisSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.schemaVersion).toBe("1.0");
      expect(parsed.data.trends).toBeDefined();
      expect(parsed.data.summary).toBeDefined();
    }
  });

  it("正常输入包含能力变化数据", () => {
    const input = loadExample("normal");
    const result = analyzeGrowthData(input as Parameters<typeof analyzeGrowthData>[0]);
    expect(result.trends.abilityChanges.length).toBeGreaterThanOrEqual(3);
    const pythonChange = result.trends.abilityChanges.find(
      (c) => c.abilityKey === "python",
    );
    expect(pythonChange).toBeDefined();
    expect(pythonChange!.direction).toBe("up");
    expect(pythonChange!.delta).toBeGreaterThan(0);
  });

  it("正常输入正确计算计划完成率", () => {
    const input = loadExample("normal");
    const result = analyzeGrowthData(input as Parameters<typeof analyzeGrowthData>[0]);
    expect(result.trends.totalCompletedPlans).toBe(1);
    expect(result.trends.totalActivePlans).toBe(1);
    expect(result.trends.planCompletionRate).toBe(0.5);
  });

  it("正常输入正确聚合模拟训练进度", () => {
    const input = loadExample("normal");
    const result = analyzeGrowthData(input as Parameters<typeof analyzeGrowthData>[0]);
    expect(result.trends.simulationProgress.length).toBeGreaterThanOrEqual(1);
    const techInterview = result.trends.simulationProgress.find(
      (s) => s.scenarioKey === "tech_interview",
    );
    expect(techInterview).toBeDefined();
    expect(techInterview!.attempts).toBe(2);
    expect(techInterview!.bestScore).toBe(80);
    expect(techInterview!.trend).toBe("improving");
  });

  // ---- 薄弱项 ----

  it("正常输入正确标记薄弱项", () => {
    const input = loadExample("normal");
    const result = analyzeGrowthData(input as Parameters<typeof analyzeGrowthData>[0]);
    // machineLearning 分数 40 < 45 阈值
    expect(result.trends.weaknesses).toContain("machineLearning");
    expect(result.summary.weakAreas).toContain("machineLearning");
  });

  it("正常输入正确标记优势项", () => {
    const input = loadExample("normal");
    const result = analyzeGrowthData(input as Parameters<typeof analyzeGrowthData>[0]);
    // statistics 分数 70 >= 70 阈值
    expect(result.summary.strongAreas).toContain("statistics");
  });

  // ---- 连续训练天数 ----

  it("正常输入正确计算连续训练天数", () => {
    const input = loadExample("normal");
    const result = analyzeGrowthData(input as Parameters<typeof analyzeGrowthData>[0]);
    // 1/15-1/17 连续3天, 1/20-1/21 连续2天, 2/1-2/3 连续3天, 3/10-3/13 连续4天
    expect(result.trends.continuousTrainingDays).toBeGreaterThanOrEqual(3);
  });

  // ---- 空输入 ----

  it("空输入不抛出异常", () => {
    const input = loadExample("empty");
    expect(() => {
      analyzeGrowthData(input as Parameters<typeof analyzeGrowthData>[0]);
    }).not.toThrow();
  });

  it("空输入产出合法的 GrowthAnalysis", () => {
    const input = loadExample("empty");
    const result = analyzeGrowthData(input as Parameters<typeof analyzeGrowthData>[0]);
    const parsed = growthAnalysisSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("空用户（无历史数据）各项统计为零或 insufficient_data", () => {
    const input = loadExample("empty");
    const result = analyzeGrowthData(input as Parameters<typeof analyzeGrowthData>[0]);
    expect(result.trends.abilityChanges).toEqual([]);
    expect(result.trends.totalCompletedPlans).toBe(0);
    expect(result.trends.continuousTrainingDays).toBe(0);
    expect(result.summary.overallDirection).toBe("insufficient_data");
  });

  // ---- 损坏输入 ----

  it("损坏输入不抛出异常且产出合法结构", () => {
    const input = loadExample("corrupt");
    let result;
    expect(() => {
      result = analyzeGrowthData(input as Parameters<typeof analyzeGrowthData>[0]);
    }).not.toThrow();
    const parsed = growthAnalysisSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  // ---- 敏感信息检测 ----

  it("含敏感字段的输入被 detectSensitiveFields 检测到", () => {
    const input = loadExample("sensitive") as Parameters<typeof analyzeGrowthData>[0];
    const warnings = detectSensitiveFields(input);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings.some((w) => w.includes("手机"))).toBe(true);
    expect(warnings.some((w) => w.includes("邮箱"))).toBe(true);
  });

  it("detectSensitiveFields 对正常输入无警告", () => {
    const input = loadExample("normal") as Parameters<typeof analyzeGrowthData>[0];
    const warnings = detectSensitiveFields(input);
    expect(warnings).toEqual([]);
  });

  // ---- 一致性评分 ----

  it("一致性评分在 0-1 范围内", () => {
    const input = loadExample("normal");
    const result = analyzeGrowthData(input as Parameters<typeof analyzeGrowthData>[0]);
    expect(result.summary.consistencyScore).toBeGreaterThanOrEqual(0);
    expect(result.summary.consistencyScore).toBeLessThanOrEqual(1);
  });

  // ---- 总分检查 ----

  it("totalProgressEvents 与输入一致", () => {
    const input = loadExample("normal");
    const result = analyzeGrowthData(input as Parameters<typeof analyzeGrowthData>[0]);
    expect(result.trends.totalProgressEvents).toBe(12);
  });

  // ---- 方向判定 ----

  it("能力全面提升判定 overallDirection 为 improving", () => {
    const input = loadExample("normal");
    const result = analyzeGrowthData(input as Parameters<typeof analyzeGrowthData>[0]);
    expect(result.summary.overallDirection).toBe("improving");
  });

  // ---- 手动构造：分数倒退 ----

  it("能力分数倒退正确标记方向 down", () => {
    const result = analyzeGrowthData({
      profileSnapshot: {
        available: true,
        data: { abilityScores: { python: 30 } },
      },
      planHistory: [],
      progressLogs: [],
      simulations: [],
      historicalScores: [
        {
          abilityKey: "python",
          score: 80,
          observedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const python = result.trends.abilityChanges.find(
      (c) => c.abilityKey === "python",
    );
    expect(python).toBeDefined();
    expect(python!.direction).toBe("down");
    expect(python!.delta).toBeLessThan(0);
  });
});
