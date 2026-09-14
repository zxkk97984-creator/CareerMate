import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AbilityRadarChart } from "./ability-radar-chart";
import { abilityKeys, abilityShortLabels, type AbilityKey } from "@/lib/types";

function abilities(scores: Partial<Record<AbilityKey, number | null>>) {
  return abilityKeys.map((key) => ({ key, label: `完整标签-${key}`, score: scores[key] ?? null }));
}

const ALL = { aiTooling: 58, roleFoundation: 42, dataAnalysis: 45, businessProduct: 50, communication: 62, projectPractice: 38 };

describe("AbilityRadarChart (SSR)", () => {
  it("六维齐全时输出实心多边形并逐维进入无障碍摘要", () => {
    const html = renderToStaticMarkup(<AbilityRadarChart abilities={abilities(ALL)} />);
    expect(html).toContain("growth-radar-polygon");
    expect(html).not.toContain("growth-radar-polyline");
    expect(html).not.toContain("stroke-dasharray");
    expect(html).toContain('role="img"');
    for (const [key, score] of Object.entries(ALL)) {
      expect(html).toContain(`${abilityShortLabels[key as AbilityKey]} ${score} 分`);
    }
    expect(html).toContain("能力雷达图：");
    expect(html).toContain("6 项维度均有评估数据。");
  });

  it("部分评估时只画虚线折线，缺失维度标注待评估且不按 0 分计入", () => {
    const html = renderToStaticMarkup(<AbilityRadarChart abilities={abilities({ aiTooling: 58, communication: 62 })} />);
    expect(html).not.toContain("growth-radar-polygon");
    expect(html).toContain("growth-radar-polyline");
    expect(html).toContain('stroke-dasharray="5 4"');
    expect(html).toContain("待评估");
    expect(html).toContain("虚线仅连接已评估维度；4 项待评估不会按 0 分计入。");
    expect(html).not.toContain('value="0"');
  });

  it("全部未评估时给出空状态且不出现任何数据图形", () => {
    const html = renderToStaticMarkup(<AbilityRadarChart abilities={abilities({})} />);
    expect(html).not.toContain("growth-radar-polygon");
    expect(html).not.toContain("growth-radar-polyline");
    expect(html).not.toContain("growth-radar-dot");
    expect(html).toContain("还没有可展示的能力评估");
    expect(html).toContain("完成画像或任务后，能力维度会出现在雷达图上。");
    expect(html).not.toContain('value="0"');
  });

  it("三种状态的首帧都不含内联透明残留", () => {
    for (const scores of [ALL, { aiTooling: 58 }, {}]) {
      const html = renderToStaticMarkup(<AbilityRadarChart abilities={abilities(scores)} />);
      expect(html).not.toContain("opacity:0");
      expect(html).not.toContain('style="');
    }
  });
});
