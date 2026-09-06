import { describe, expect, it } from "vitest";
import { calculateMatchScore, normalizeWeights } from "./career";

function weights(a: number, b: number): Record<string, number> {
  return { dataAnalysis: a, aiTooling: b };
}

describe("normalizeWeights", () => {
  it("drops non-finite / negative weights and returns null when none valid", () => {
    expect(normalizeWeights({ dataAnalysis: 0.5, aiTooling: Number.NaN, communication: -1 })).toEqual({ dataAnalysis: 0.5 });
    expect(normalizeWeights({ dataAnalysis: Number.NaN })).toBeNull();
    expect(normalizeWeights(undefined)).toBeNull();
  });
});

describe("calculateMatchScore", () => {
  it("computes a weighted score and never returns NaN for bad weights", () => {
    const { score, breakdown } = calculateMatchScore(weights(0.5, 0.5), { dataAnalysis: 80, aiTooling: 60 });
    expect(score).toBe(70);
    expect(breakdown).toHaveLength(2);
  });

  it("treats a dimension with no recorded score as unassessed, not as 0", () => {
    const { score, unassessed } = calculateMatchScore(weights(0.5, 0.5), { dataAnalysis: 80 });
    expect(unassessed).toContain("aiTooling");
    // 只有 dataAnalysis 有记录，分数按有效权重归一化，而不是把 aiTooling 当 0
    expect(score).toBe(80);
  });

  it("returns null score when nothing is recorded (info insufficient, not a fake 0)", () => {
    const { score, unassessed } = calculateMatchScore(weights(0.5, 0.5), {});
    expect(score).toBeNull();
    expect(unassessed).toContain("dataAnalysis");
    expect(unassessed).toContain("aiTooling");
  });

  it("prioritizes weak abilities by weight*(100-score), not by lowest raw score", () => {
    const { breakdown } = calculateMatchScore(weights(0.9, 0.1), { dataAnalysis: 80, aiTooling: 70 });
    const data = breakdown.find((d) => d.key === "dataAnalysis")!;
    const ai = breakdown.find((d) => d.key === "aiTooling")!;
    // dataAnalysis 权重高（0.9），gap = 0.9*(100-80)=18；aiTooling 权重低，gap = 0.1*(100-70)=3
    expect(data.gap).toBeGreaterThan(ai.gap!);
  });

  it("normalizes by total valid weight so a partial record isn't understated", () => {
    const { score } = calculateMatchScore(weights(0.5, 0.5), { dataAnalysis: 100 });
    // 0.5 权重归一化：100*0.5/0.5 = 100
    expect(score).toBe(100);
  });

  it("never outputs NaN even when a recorded score is non-finite", () => {
    const { score } = calculateMatchScore(weights(1, 1), { dataAnalysis: Number.NaN, aiTooling: 50 });
    expect(Number.isNaN(score)).toBe(false);
  });
});
