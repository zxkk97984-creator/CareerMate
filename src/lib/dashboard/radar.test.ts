import { describe, expect, it } from "vitest";
import { RADAR_CENTER, RADAR_MAX_RADIUS, buildRadarGeometry, normalizeRadarScore, radarAxisAngle, type RadarAbilityInput } from "./radar";
import { abilityKeys, type AbilityKey } from "@/lib/types";

function abilities(scores: Partial<Record<AbilityKey, number | null>>): RadarAbilityInput[] {
  return abilityKeys.map((key) => ({ key, label: `完整标签-${key}`, score: scores[key] ?? null }));
}

function radiusOf(x: number | null, y: number | null): number {
  if (x === null || y === null) throw new Error("顶点不存在");
  return Math.hypot(x - RADAR_CENTER.x, y - RADAR_CENTER.y);
}

describe("能力雷达图几何", () => {
  it("按 abilityKeys 固定顺序生成六轴，第一维指向正上方", () => {
    const geometry = buildRadarGeometry(abilities({}));
    expect(geometry.axes.map((axis) => axis.key)).toEqual(abilityKeys);
    expect(geometry.axes.map((axis) => axis.angle)).toEqual([-90, -30, 30, 90, 150, 210]);
    const top = buildRadarGeometry(abilities({ aiTooling: 100 })).axes[0];
    expect(top.x).toBe(RADAR_CENTER.x);
    expect(top.y).toBe(RADAR_CENTER.y - RADAR_MAX_RADIUS);
    expect(geometry.totalCount).toBe(6);
  });

  it("把 0/50/100 映射为圆心、半半径与满分半径，并钳制越界值", () => {
    const geometry = buildRadarGeometry(abilities({ aiTooling: 0, roleFoundation: 50, dataAnalysis: 100, businessProduct: 120, communication: -5 }));
    const [zero, half, full, overflow, negative] = geometry.axes;
    expect(radiusOf(zero.x, zero.y)).toBeCloseTo(0);
    expect(radiusOf(half.x, half.y)).toBeCloseTo(RADAR_MAX_RADIUS / 2);
    expect(radiusOf(full.x, full.y)).toBeCloseTo(RADAR_MAX_RADIUS);
    expect(radiusOf(overflow.x, overflow.y)).toBeCloseTo(RADAR_MAX_RADIUS);
    expect(radiusOf(negative.x, negative.y)).toBeCloseTo(0);
    expect(overflow.score).toBe(100);
    expect(negative.score).toBe(0);
  });

  it("未评估维度不产生顶点坐标", () => {
    const geometry = buildRadarGeometry(abilities({ dataAnalysis: 72 }));
    const missing = geometry.axes.filter((axis) => !axis.evaluated);
    expect(missing).toHaveLength(5);
    for (const axis of missing) {
      expect(axis.score).toBeNull();
      expect(axis.x).toBeNull();
      expect(axis.y).toBeNull();
      // 不允许退化到圆心(等价于画成 0 分)
      expect(axis.x).not.toBe(RADAR_CENTER.x);
    }
    expect(normalizeRadarScore(Number.NaN)).toBeNull();
    expect(normalizeRadarScore(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("六维齐全才画闭合多边形，部分评估只画已评估顶点的折线", () => {
    const all = buildRadarGeometry(abilities({ aiTooling: 58, roleFoundation: 42, dataAnalysis: 45, businessProduct: 50, communication: 62, projectPractice: 38 }));
    expect(all.evaluatedCount).toBe(6);
    expect(all.polygonPoints).not.toBeNull();
    expect(all.polylinePoints).toBeNull();
    expect(all.polygonPoints!.split(" ")).toHaveLength(6);

    const partial = buildRadarGeometry(abilities({ aiTooling: 58, communication: 62 }));
    expect(partial.evaluatedCount).toBe(2);
    expect(partial.polygonPoints).toBeNull();
    expect(partial.polylinePoints!.split(" ")).toHaveLength(2);
  });

  it("全部未评估时两种图形都为空", () => {
    const geometry = buildRadarGeometry(abilities({}));
    expect(geometry.evaluatedCount).toBe(0);
    expect(geometry.polygonPoints).toBeNull();
    expect(geometry.polylinePoints).toBeNull();
    expect(geometry.rings).toHaveLength(4);
    expect(geometry.spokes).toHaveLength(6);
  });

  it("轴角度按维度数均分", () => {
    expect(radarAxisAngle(0, 6)).toBe(-90);
    expect(radarAxisAngle(3, 6)).toBe(90);
    expect(radarAxisAngle(1, 4)).toBe(0);
  });
});
