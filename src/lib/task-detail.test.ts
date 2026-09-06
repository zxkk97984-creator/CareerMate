import { describe, expect, it } from "vitest";
import { buildTaskDetail, taskStatusLabel } from "./task-detail";
import type { PlanMonth } from "./types";

const month: PlanMonth = {
  monthIndex: 1,
  goal: "掌握核心能力",
  learningTasks: [],
  practiceOutputs: ["完成一页比较表"],
  evaluationMetrics: ["至少 2 个真实测试案例"],
};

describe("buildTaskDetail", () => {
  it("reads real task fields and marks missing ones as to-be-detail later", () => {
    const d = buildTaskDetail({ task: { id: "t1", title: "比较 AI 办公工具", type: "practice", status: "in_progress", dueWeek: 2, estimatedHours: 4 }, month });
    expect(d.title).toBe("比较 AI 办公工具");
    expect(d.typeLabel).toBe("实践");
    expect(d.status).toBe("in_progress");
    expect(d.weekLabel).toBe("第 2 周");
    expect(d.estimatedHours).toBe("4 小时");
    // 单任务无独立 steps → 待细化
    expect(d.steps).toBeNull();
  });

  it("labels month-level deliverables/criteria as shared, not per-task", () => {
    const d = buildTaskDetail({ task: { id: "t1", title: "X", type: "learn", status: "not_started" }, month });
    expect(d.sharedByMonth).toBe(true);
    expect(d.deliverables).toEqual(["完成一页比较表"]);
    expect(d.completionCriteria).toEqual(["至少 2 个真实测试案例"]);
  });

  it("does not invent deliverables when the month has none", () => {
    const d = buildTaskDetail({ task: { id: "t1", title: "X", type: "learn", status: "not_started" }, month: null });
    expect(d.deliverables).toBeNull();
    expect(d.completionCriteria).toBeNull();
    expect(d.sharedByMonth).toBe(false);
    expect(d.estimatedHours).toBeNull();
  });

  it("only writes the relative week, never infers a real due date from dueWeek", () => {
    const d = buildTaskDetail({ task: { id: "t1", title: "X", type: "learn", status: "not_started", dueWeek: 5 }, month });
    expect(d.weekLabel).toBe("第 5 周");
    expect(d.weekLabel).not.toContain("月");
    expect(d.weekLabel).not.toContain("日");
  });
});

describe("taskStatusLabel", () => {
  it("maps statuses to Chinese labels without inventing new enums", () => {
    expect(taskStatusLabel("not_started")).toBe("未开始");
    expect(taskStatusLabel("in_progress")).toBe("进行中");
    expect(taskStatusLabel("done")).toBe("已完成");
    expect(taskStatusLabel("delayed")).toBe("已延期");
  });
});
