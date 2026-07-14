import { describe, expect, it } from "vitest";
import { explorationReportSchema } from "@/lib/careers/exploration-schema";
import { createMockStructuredResult } from "./fixtures";

describe("mock structured fixtures", () => {
  it("does not hard-code a target role into an offline career plan", () => {
    const result = createMockStructuredResult("请帮我制定三个月行动计划") as {
      type: string;
      targetRole?: string;
      plan: unknown;
    };

    expect(result.type).toBe("career_plan");
    expect(result.targetRole).toBeUndefined();
    expect(JSON.stringify(result.plan)).not.toMatch(/数据分析|Python/);
    expect(JSON.stringify(result.plan)).toContain("目标岗位");
  });

  it("does not invent market growth or salary claims without live sources", () => {
    const result = createMockStructuredResult("请介绍用户研究员这个岗位") as {
      summary: string;
      responsibilities: string[];
      coreCompetencies: string[];
      entryPaths: string[];
      marketSignals: string[];
      risksAndUncertainties: string[];
      sources: Array<{ label: string }>;
    };

    expect(result.responsibilities).toEqual([]);
    expect(result.coreCompetencies).toEqual([]);
    expect(result.entryPaths).toEqual([]);
    expect(result.marketSignals).toEqual([]);
    expect(result.summary).not.toMatch(/增长|薪资|%/);
    expect(result.risksAndUncertainties.join(" ")).not.toContain("基于公开信息");
    expect(result.sources).toEqual([
      expect.objectContaining({ label: "AI分析与推断" }),
    ]);
    expect(explorationReportSchema.safeParse(result).success).toBe(true);
  });
});
