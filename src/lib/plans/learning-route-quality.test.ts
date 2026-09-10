import { describe, expect, it } from "vitest";
import { assessLearningRouteDataQuality } from "./learning-route-quality";

function route(overrides: Record<string, unknown> = {}) {
  const task = {
    title: "完成 10 道 SQL 聚合查询",
    description: "使用公开销售数据完成查询并记录过滤逻辑",
    estimatedHours: 4,
    outputs: ["10 道查询结果"],
    acceptanceCriteria: ["能解释每个查询的分组和过滤条件"],
  };
  return {
    targetRole: "data_analyst",
    weeklyBudgetHours: 6,
    period: "1周",
    stages: [{ title: "查询基础", description: "第 1 周", tasks: [task] }],
    tasks: [task],
    resources: [],
    deliverables: ["查询记录"],
    acceptanceCriteria: ["能解释查询依据"],
    adjustmentTriggers: [],
    baseRouteVersion: null,
    ...overrides,
  };
}

describe("learning route quality", () => {
  it("accepts an executable route within the weekly budget", () => {
    expect(assessLearningRouteDataQuality(route())).toEqual([]);
  });

  it("rejects vague tasks and over-budget routes", () => {
    const issues = assessLearningRouteDataQuality(route({
      tasks: [{
        title: "完成",
        description: "待补充",
        estimatedHours: 200,
        outputs: [],
        acceptanceCriteria: [],
      }],
      stages: [{
        title: "阶段",
        tasks: [{
          title: "完成",
          description: "待补充",
          estimatedHours: 200,
          outputs: [],
          acceptanceCriteria: [],
        }],
      }],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "MISSING_TASKS" }),
    ]));
  });

  it("rejects a route whose total hours exceed weekly budget times period", () => {
    const issues = assessLearningRouteDataQuality(route({
      tasks: [{
        title: "完成 10 道 SQL 聚合查询",
        description: "使用公开销售数据完成查询并记录过滤逻辑",
        estimatedHours: 200,
        outputs: ["结果"],
        acceptanceCriteria: ["可解释"],
      }],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "WEEKLY_BUDGET_EXCEEDED" }),
    ]));
  });
});
