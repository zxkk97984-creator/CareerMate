import { describe, expect, it } from "vitest";
import { assessTaskConcreteness, calculatePlanBudget } from "./plan-budget";

describe("calculatePlanBudget", () => {
  it("sums near-term (week 1-4) task hours and spreads across weeks", () => {
    const r = calculatePlanBudget(
      [
        { id: "a", title: "任务A", estimatedHours: 4, dueWeek: 1 },
        { id: "b", title: "任务B", estimatedHours: 4, dueWeek: 2 },
        { id: "c", title: "远期里程碑", estimatedHours: 40, dueWeek: 12 },
      ],
      4,
    );
    // 只算近期 A+B（8h），远期里程碑不误算进本周预算
    expect(r.totalNearTermHours).toBe(8);
    expect(r.weeklyHours).toBe(2); // 8/4
    expect(r.ok).toBe(true);
  });

  it("flags a budget overrun instead of silently exceeding it", () => {
    const r = calculatePlanBudget(
      [
        { id: "a", title: "任务A", estimatedHours: 10, dueWeek: 1 },
        { id: "b", title: "任务B", estimatedHours: 10, dueWeek: 2 },
      ],
      2,
    );
    // 20h / 4 周 = 每周 5h > 2h 预算
    expect(r.ok).toBe(false);
    expect(r.message).toContain("超过");
  });

  it("does not count tasks without explicit hours toward the budget", () => {
    const r = calculatePlanBudget(
      [{ id: "a", title: "任务A", dueWeek: 1 }, { id: "b", title: "任务B", estimatedHours: null, dueWeek: 2 }],
      8,
    );
    expect(r.totalNearTermHours).toBe(0);
    expect(r.weeklyHours).toBe(0);
    expect(r.ok).toBe(true);
  });

  it("only writes the relative week, never infers a real due calendar date", () => {
    const r = calculatePlanBudget([{ id: "a", title: "A", estimatedHours: 2, dueWeek: 5 }], 8);
    // dueWeek=5 超出 1-4，不算近期
    expect(r.totalNearTermHours).toBe(0);
  });

  it("behaves gracefully when no budget is set", () => {
    const r = calculatePlanBudget([{ id: "a", title: "A", estimatedHours: 4, dueWeek: 1 }], null);
    expect(r.ok).toBe(true);
    expect(r.message).toContain("未设置");
  });
});

describe("assessTaskConcreteness", () => {
  it("flags vague near-term tasks without an object", () => {
    expect(assessTaskConcreteness("完成核心材料").vague).toBe(true);
    expect(assessTaskConcreteness("沉淀小产出").vague).toBe(true);
    expect(assessTaskConcreteness("提升能力").vague).toBe(true);
  });

  it("accepts concrete tasks with verbs and checkable deliverables", () => {
    expect(assessTaskConcreteness("选 2 个 AI 办公工具，围绕同一任务记录输入输出，交付一页比较表").vague).toBe(false);
    expect(assessTaskConcreteness("写出 3 个真实测试案例并整理成清单").vague).toBe(false);
  });

  it("treats an empty title as vague", () => {
    expect(assessTaskConcreteness("").vague).toBe(true);
  });
});
