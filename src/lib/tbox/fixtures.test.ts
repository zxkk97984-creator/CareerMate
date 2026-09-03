import { describe, expect, it } from "vitest";
import { createMockStructuredResult } from "./fixtures";

describe("mock structured fixtures", () => {
  it("生成 AgentResponse 格式的 plan_draft——通过 schema 校验且不强制36个月", () => {
    const result = createMockStructuredResult("请帮我制定三个月行动计划") as {
      schemaVersion: number;
      intent: string;
      operations: Array<{
        type: string;
        plan?: {
          schemaVersion: number;
          title: string;
          targetRole: { key: string; label: string };
          horizon: { value: number; unit: string };
          phases: Array<{ id: string; title: string; objective: string; duration: { value: number; unit: string }; skills: string[]; actions: Array<{ id: string; title: string }> }>;
          immediateActions: Array<{ id: string; title: string }>;
        };
      }>;
    };

    expect(result.schemaVersion).toBe(1);
    expect(result.intent).toBe("plan_generation");
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].type).toBe("plan_draft");
    const plan = result.operations[0].plan!;
    expect(plan.schemaVersion).toBe(2);
    expect(plan.title).toBeDefined();
    expect(plan.horizon.unit).toBe("month");
    // Plan V2 不强制 36 个月
    expect(plan.phases.length).toBe(3);
    expect(plan.phases[0].title).toBe("基础夯实");
    expect(plan.phases[0].actions.length).toBeGreaterThan(0);
    expect(plan.immediateActions.length).toBeGreaterThan(0);
  });

  it("探索报告不编造市场增长率或薪资声明", () => {
    const result = createMockStructuredResult("请介绍用户研究员这个岗位") as {
      schemaVersion: number;
      intent: string;
      operations: Array<{
        type: string;
        report?: {
          roleName: string;
          summary: string;
          marketSignals: string[];
          sources: Array<{ label: string }>;
        };
      }>;
    };

    expect(result.schemaVersion).toBe(1);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].type).toBe("exploration_report");
    const report = result.operations[0].report!;
    expect(report.marketSignals).not.toContain(expect.stringMatching(/增长|薪资|%/));
    expect(report.summary).not.toMatch(/增长|薪资|%/);
    // 标注 AI分析与推断
    expect(report.sources).toEqual([
      expect.objectContaining({ label: "AI分析与推断" }),
    ]);
  });
});
