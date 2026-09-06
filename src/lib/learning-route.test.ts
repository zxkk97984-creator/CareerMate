import { describe, expect, it } from "vitest";
import { toLearningRouteView } from "./learning-route";

const related = { id: "plan-1", targetRoleLabel: "数据分析师", version: 3, status: "active" };

describe("toLearningRouteView", () => {
  it("parses a valid content shape into a view", () => {
    const view = toLearningRouteView({
      targetRole: "data_analyst",
      weeklyBudgetHours: 8,
      period: "3 个月",
      stages: [{ title: "打基础", description: "掌握 SQL", tasks: ["学聚合", "练 JOIN"] }],
      tasks: ["完成 3 个真实案例"],
      resources: ["SQL 教程"],
      deliverables: ["一页实训对比表"],
      acceptanceCriteria: ["至少 2 个真实测试案例"],
    }, related, 2);

    expect(view.present).toBe(true);
    expect(view.stages).toHaveLength(1);
    expect(view.stages[0].tasks).toEqual(["学聚合", "练 JOIN"]);
    expect(view.tasks).toEqual(["完成 3 个真实案例"]);
    expect(view.deliverables).toEqual(["一页实训对比表"]);
    expect(view.relatedPlan?.status).toBe("active");
    expect(view.relatedPlan?.archived).toBe(false);
  });

  it("degraded on corrupt/non-object content rather than rendering it", () => {
    const view = toLearningRouteView("not json", related, null);
    expect(view.present).toBe(false);
    expect(view.degraded).toContain("无法解析");
    expect(view.stages).toHaveLength(0);
  });

  it("flags an archived related plan for review instead of auto-migrating", () => {
    const view = toLearningRouteView({ tasks: ["X"] }, { ...related, status: "archived" }, 2);
    expect(view.relatedPlan?.archived).toBe(true);
  });

  it("degrades empty content without inventing fake rows", () => {
    const view = toLearningRouteView({}, related, null);
    expect(view.present).toBe(false);
    expect(view.degraded).toContain("暂无已确认");
    expect(view.tasks).toHaveLength(0);
  });

  it("tolerates unknown stage shape (drops malformed entries) instead of throwing", () => {
    const view = toLearningRouteView({ stages: [42, { name: "有效阶段" }, null, {}] }, related, null);
    expect(view.stages).toHaveLength(1);
    expect(view.stages[0].title).toBe("有效阶段");
  });

  it("keeps weeklyBudgetHours only when it is a positive number", () => {
    expect(toLearningRouteView({ weeklyBudgetHours: 8 }, related, null).weeklyBudgetHours).toBe(8);
    expect(toLearningRouteView({ weeklyBudgetHours: "eight" }, related, null).weeklyBudgetHours).toBeNull();
  });
});
