import { describe, expect, it } from "vitest";
import { selectNextAction, type NextActionInput } from "./next-action";

function base(over: Partial<NextActionInput> = {}): NextActionInput {
  return {
    profileCompleted: true,
    plan: { id: "pl-1" },
    pendingPlan: null,
    tasks: [],
    ...over,
  };
}

describe("selectNextAction", () => {
  it("routes incomplete profile to onboarding regardless of plan", () => {
    const action = selectNextAction(base({ profileCompleted: false, plan: { id: "p1" }, tasks: [{ id: "t1", title: "X", status: "in_progress" }] }));
    expect(action.kind).toBe("onboarding");
    expect(action.href).toBe("/onboarding");
  });

  it("reviews pending plan when there is no active plan but a pending exists", () => {
    const action = selectNextAction(base({ plan: null, pendingPlan: { id: "pend-1" } }));
    expect(action.kind).toBe("review_pending_plan");
    if (action.kind === "review_pending_plan") {
      expect(action.planId).toBe("pend-1");
      expect(action.href).toBe("/path");
    }
  });

  it("generates the first plan when there is no plan and no pending", () => {
    const action = selectNextAction(base({ plan: null, pendingPlan: null }));
    expect(action.kind).toBe("generate_first_plan");
    expect(action.href).toBe("/dashboard");
  });

  it("continues the in-progress task", () => {
    const action = selectNextAction(base({ tasks: [
      { id: "t1", title: "未开始任务", status: "not_started", dueWeek: 1 },
      { id: "t2", title: "进行中任务", status: "in_progress", dueWeek: 2 },
    ] }));
    expect(action.kind).toBe("continue_task");
    if (action.kind === "continue_task") {
      expect(action.taskId).toBe("t2");
      expect(action.href).toContain("t2");
    }
  });

  it("surfaces delayed tasks for review", () => {
    const action = selectNextAction(base({ tasks: [
      { id: "t1", title: "延期任务", status: "delayed" },
      { id: "t2", title: "未开始", status: "not_started" },
    ] }));
    expect(action.kind).toBe("review_delayed");
    if (action.kind === "review_delayed") expect(action.taskIds).toContain("t1");
  });

  it("picks the earliest not-started task by dueWeek then original order", () => {
    const action = selectNextAction(base({ tasks: [
      { id: "late", title: "晚", status: "not_started", dueWeek: 3, order: 0 },
      { id: "early", title: "早", status: "not_started", dueWeek: 1, order: 1 },
      { id: "no-week", title: "无周", status: "not_started", dueWeek: undefined, order: 2 },
    ] }));
    expect(action.kind).toBe("next_task");
    if (action.kind === "next_task") expect(action.taskId).toBe("early");
  });

  it("is deterministic for equal-priority items, using original order", () => {
    const a = selectNextAction(base({ tasks: [
      { id: "x", title: "第一", status: "not_started", dueWeek: 1, order: 0 },
      { id: "y", title: "第二", status: "not_started", dueWeek: 1, order: 1 },
    ] }));
    const b = selectNextAction(base({ tasks: [
      { id: "x", title: "第一", status: "not_started", dueWeek: 1, order: 0 },
      { id: "y", title: "第二", status: "not_started", dueWeek: 1, order: 1 },
    ] }));
    expect(a).toEqual(b);
    if (a.kind === "next_task" && b.kind === "next_task") expect(a.taskId).toBe("x");
  });

  it("falls to period review when everything is done", () => {
    const action = selectNextAction(base({ tasks: [{ id: "t1", title: "完成", status: "done" }], hasCompleted: true }));
    expect(action.kind).toBe("review_period");
  });
});
