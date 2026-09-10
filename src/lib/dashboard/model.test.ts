import { describe, expect, it } from "vitest";
import { buildDashboard, isGrowthEvidence, presentEvidence } from "./model";
import type { UnifiedPlanTask } from "@/lib/plans/task-model";

const task: UnifiedPlanTask = {
  id: "t1", title: "完成 SQL 练习", description: "", type: "practice", status: "not_started",
  estimatedHours: null, cadence: null, resources: [], phaseId: "p1", phaseTitle: "基础阶段",
  dueWeek: null, outputs: ["查询记录"], acceptanceCriteria: ["能解释查询"], order: 0, sourceVersion: 1,
};
const input = { profile: null, plan: null, pendingPlan: null, match: null, candidateCount: 0, evidence: [] };

describe("dashboard read model", () => {
  it("keeps empty progress unknown and guides new users to onboarding", () => {
    const result = buildDashboard(input);
    expect(result.progress.completionRate).toBeNull();
    expect(result.action.href).toBe("/onboarding");
    expect(result.abilities.every((a) => a.score === null)).toBe(true);
  });
  it("uses shared task statistics, preserves unknown hours and prioritizes in-progress", () => {
    const result = buildDashboard({ ...input, profile: { onboardingCompleted: true, targetRoleLabel: "分析师", weeklyAvailableHours: 8, abilityScores: {} }, plan: { id: "p", tasks: [task, { ...task, id: "t2", status: "in_progress" }] } });
    expect(result.action.task?.id).toBe("t2");
    expect(result.action.href).toBe("/path?taskId=t2");
    expect(result.progress.total).toBe(2);
    expect(result.action.task?.estimatedHours).toBeNull();
  });
  it.each(["generating", "processing", "generation_failed", "pending"])("distinguishes pending plan status %s", (status) => {
    const result = buildDashboard({ ...input, profile: { onboardingCompleted: true, targetRoleLabel: null, weeklyAvailableHours: null, abilityScores: {} }, pendingPlan: { id: "new", status } });
    expect(result.action.href).toBe("/path");
    expect(result.action.title).toBe(result.attention[0].title);
    expect(result.action.title.includes("准备好")).toBe(status === "pending");
  });
  it("does not call an empty plan completed and treats completed plans as reviewable", () => {
    const profile = { onboardingCompleted: true, targetRoleLabel: null, weeklyAvailableHours: null, abilityScores: {} };
    expect(buildDashboard({ ...input, profile, plan: { id: "p", tasks: [] } }).action.kind).toBe("generate");
    const done = buildDashboard({ ...input, profile, plan: { id: "p", tasks: [{ ...task, status: "done" }] } });
    expect(done.progress.completionRate).toBe(100);
    expect(done.action.kind).toBe("link");
    expect(done.recentTasks).toEqual([]);
  });
  it("uses structured completion state instead of matching arbitrary log prose", () => {
    expect(isGrowthEvidence({ eventType: "task_status_updated", metadata: '{"status":"in_progress"}', summary: "done → in_progress" })).toBe(false);
    expect(isGrowthEvidence({ eventType: "task_status_updated", metadata: '{"status":"done"}', summary: "" })).toBe(true);
    expect(isGrowthEvidence({ eventType: "task_status_updated", metadata: "broken", summary: "not_started → done" })).toBe(false);
  });
  it("surfaces delayed work and known over-budget weeks without inventing deadlines", () => {
    const profile = { onboardingCompleted: true, targetRoleLabel: null, weeklyAvailableHours: 2, abilityScores: {} };
    const result = buildDashboard({ ...input, profile, candidateCount: 7, plan: { id: "p", tasks: [{ ...task, status: "delayed", dueWeek: 2, estimatedHours: 5 }] } });
    expect(result.attention.map((item) => item.id)).toEqual(["delayed", "budget", "candidates"]);
    expect(result.progress.budgetStatus).toBe("over");
    expect(result.action.task?.status).toBe("delayed");
  });
  it("does not let an existing task override incomplete onboarding", () => {
    expect(buildDashboard({ ...input, plan: { id: "p", tasks: [task] } }).action.href).toBe("/onboarding");
  });
  it("uses task snapshots, then original plan names, then a Chinese fallback", () => {
    const log = { id: "l", eventType: "task_status_updated", metadata: '{"status":"done","taskTitle":"旧任务名"}', title: "更新本月任务状态", summary: "in_progress → done", createdAt: new Date() };
    expect(presentEvidence(log, "当前名").title).toBe("旧任务名");
    expect(presentEvidence({ ...log, metadata: "{}" }, "原任务名").title).toBe("原任务名");
    expect(presentEvidence({ ...log, metadata: "{}" }).summary).toBe("已完成任务");
  });
});
