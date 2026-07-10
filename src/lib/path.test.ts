import { describe, expect, it } from "vitest";
import { groupPlanTimeline, updatePlanTaskStatus } from "./path";

describe("groupPlanTimeline", () => {
  it("keeps all 3 years, 12 quarters, and 36 months", () => {
    const years = Array.from({ length: 3 }, (_, index) => ({ yearIndex: index + 1 }));
    const quarters = Array.from({ length: 12 }, (_, index) => ({ quarterIndex: index + 1 }));
    const months = Array.from({ length: 36 }, (_, index) => ({ monthIndex: index + 1 }));

    const grouped = groupPlanTimeline({ years, quarters, months });

    expect(grouped).toHaveLength(3);
    expect(grouped.flatMap((year) => year.quarters)).toHaveLength(12);
    expect(grouped.flatMap((year) => year.months)).toHaveLength(36);
    expect(grouped[2].months.at(-1)).toEqual({ monthIndex: 36 });
  });
});

describe("updatePlanTaskStatus", () => {
  const months = Array.from({ length: 36 }, (_, index) => ({
    monthIndex: index + 1,
    goal: "Start",
    learningTasks: index === 0
      ? [{ id: "task-1", title: "Learn", type: "learn", status: "not_started" as const, dueWeek: 2 }]
      : [],
    practiceOutputs: [],
    evaluationMetrics: [],
  }));

  it("immutably updates exactly one valid task", () => {
    const result = updatePlanTaskStatus(JSON.stringify(months), "task-1", "done");

    expect(result).toMatchObject({ kind: "updated", previousStatus: "not_started" });
    if (result.kind === "updated") {
      expect(result.months[0].learningTasks[0].status).toBe("done");
    }
    expect(months[0].learningTasks[0].status).toBe("not_started");
  });

  it("reports unchanged, missing, duplicate, and malformed task structures", () => {
    expect(updatePlanTaskStatus(JSON.stringify(months), "task-1", "not_started").kind).toBe("unchanged");
    expect(updatePlanTaskStatus(JSON.stringify(months), "missing", "done").kind).toBe("missing");
    const duplicated = months.map((month, index) => index === 1 ? { ...month, learningTasks: months[0].learningTasks } : month);
    expect(updatePlanTaskStatus(JSON.stringify(duplicated), "task-1", "done").kind).toBe("invalid");
    expect(updatePlanTaskStatus("{}", "task-1", "done").kind).toBe("invalid");
  });
});
