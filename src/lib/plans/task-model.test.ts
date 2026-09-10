import { describe, expect, it } from "vitest";
import type { CareerPlanRow } from "./compatibility";
import type { AiCareerPlanV2 } from "./schema-v2";
import {
  assessPlanV2Quality,
  normalizePlanTasks,
  planTaskSummaryFromRow,
  selectUnifiedNextTask,
  summarizePlanTasks,
  updateUnifiedPlanTaskStatus,
} from "./task-model";

function row(overrides: Partial<CareerPlanRow> = {}): CareerPlanRow {
  return {
    id: "plan-1",
    userId: "user-1",
    targetRole: "data_analyst",
    targetRoleLabel: "数据分析师",
    version: 1,
    status: "active",
    schemaVersion: 1,
    content: "{}",
    parentPlanId: null,
    activatedAt: null,
    years: "[]",
    quarters: "[]",
    months: JSON.stringify([
      {
        monthIndex: 1,
        goal: "基础建立",
        learningTasks: [
          {
            id: "v1-task-1",
            title: "完成 SQL 查询练习",
            type: "practice",
            status: "in_progress",
            dueWeek: 2,
            estimatedHours: 4,
          },
        ],
        practiceOutputs: ["一份查询练习记录"],
        evaluationMetrics: ["能解释每个查询的过滤条件"],
      },
    ]),
    currentMonthIndex: 1,
    assumptions: "[]",
    riskNotes: "[]",
    generationMeta: "{}",
    ...overrides,
  };
}

function planV2(overrides: Partial<AiCareerPlanV2> = {}): AiCareerPlanV2 {
  return {
    schemaVersion: 2,
    title: "数据分析师 8 周计划",
    targetRole: { key: "data_analyst", label: "数据分析师" },
    summary: "从 SQL 基础到一份可展示分析报告",
    horizon: { value: 8, unit: "week" },
    phases: [
      {
        id: "phase-1",
        title: "基础阶段",
        objective: "掌握 SQL 查询和聚合",
        duration: { value: 4, unit: "week" },
        skills: ["SQL"],
        actions: [
          {
            id: "v2-action-1",
            title: "完成 SQL 聚合查询练习",
            description: "使用公开销售数据完成 5 道聚合查询并记录结果",
            type: "practice",
            status: "not_started",
            estimatedHours: 4,
            resources: ["SQL 查询基础"],
            outputs: ["5 道查询及结果截图"],
            acceptanceCriteria: ["每道题能说明分组和过滤逻辑"],
          },
        ],
        outputs: ["SQL 查询记录"],
        evaluationCriteria: ["能独立完成基础查询"],
        risks: [],
      },
    ],
    immediateActions: [
      {
        id: "v2-imm-1",
        title: "下载公开销售数据集",
        description: "从公开数据源下载一份 CSV 并确认字段含义",
        type: "learning",
        status: "in_progress",
        estimatedHours: 1,
        resources: [],
        outputs: ["数据字段说明"],
        acceptanceCriteria: ["能说出 3 个关键字段的含义"],
      },
    ],
    assumptions: [],
    riskNotes: [],
    evidenceRefs: [],
    ...overrides,
  };
}

describe("shared plan task model", () => {
  it("normalizes V1 month tasks with month-level outputs and acceptance", () => {
    const tasks = normalizePlanTasks(row());

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: "v1-task-1",
      status: "in_progress",
      dueWeek: 2,
      estimatedHours: 4,
      outputs: ["一份查询练习记录"],
      acceptanceCriteria: ["能解释每个查询的过滤条件"],
      sourceVersion: 1,
    });
  });

  it("normalizes V2 phase actions and immediate actions with derived week windows", () => {
    const tasks = normalizePlanTasks(row({
      schemaVersion: 2,
      content: JSON.stringify(planV2()),
    }));

    expect(tasks.map((task) => task.id)).toEqual(["v2-action-1", "v2-imm-1"]);
    expect(tasks[0]).toMatchObject({
      phaseId: "phase-1",
      phaseTitle: "基础阶段",
      dueWeek: 4,
      outputs: ["5 道查询及结果截图"],
      acceptanceCriteria: ["每道题能说明分组和过滤逻辑"],
      sourceVersion: 2,
    });
    expect(tasks[1]).toMatchObject({
      phaseId: "immediate",
      dueWeek: 1,
      status: "in_progress",
    });
  });

  it("selects in-progress before delayed and not-started tasks", () => {
    const tasks = normalizePlanTasks(row({
      schemaVersion: 2,
      content: JSON.stringify(planV2()),
    }));
    expect(selectUnifiedNextTask(tasks)?.id).toBe("v2-imm-1");
  });

  it("reports budget overrun per week instead of averaging unknown work", () => {
    const summary = summarizePlanTasks([
      {
        id: "a", title: "A", description: "", type: "learning", status: "not_started",
        estimatedHours: 3, cadence: null, resources: [], phaseId: null, phaseTitle: null,
        dueWeek: 1, outputs: [], acceptanceCriteria: [], order: 0, sourceVersion: 2,
      },
      {
        id: "b", title: "B", description: "", type: "practice", status: "not_started",
        estimatedHours: 4, cadence: null, resources: [], phaseId: null, phaseTitle: null,
        dueWeek: 1, outputs: [], acceptanceCriteria: [], order: 1, sourceVersion: 2,
      },
    ], 6);

    expect(summary.budgetStatus).toBe("over");
    expect(summary.plannedWeeklyHours).toBe(7);
    expect(summary.overBudgetWeeks).toEqual([1]);
  });

  it("does not turn an empty plan into a zero-percent success", () => {
    const summary = summarizePlanTasks([], 6);
    expect(summary.completionRate).toBeNull();
    expect(summary.budgetStatus).toBe("unknown");
    expect(summary.missingReasons).toContain("当前计划没有可读取的任务");
  });

  it("keeps unknown estimated hours unknown instead of reporting zero", () => {
    const summary = summarizePlanTasks([
      {
        id: "unknown-hours", title: "待补充投入", description: "", type: "learning",
        status: "not_started", estimatedHours: null, cadence: null, resources: [],
        phaseId: null, phaseTitle: null, dueWeek: 2, outputs: [], acceptanceCriteria: [],
        order: 0, sourceVersion: 1,
      },
    ], 6);

    expect(summary.plannedWeeklyHours).toBeNull();
    expect(summary.budgetStatus).toBe("unknown");
    expect(summary.budgetMessage).toContain("缺少预计投入");
  });

  it("converts V1 month-relative weeks into plan weeks", () => {
    const source = row({
      months: JSON.stringify([
        {
          monthIndex: 1,
          goal: "第一月",
          learningTasks: [{ id: "m1", title: "第一月任务", dueWeek: 2, estimatedHours: 4, status: "not_started" }],
          practiceOutputs: [],
          evaluationMetrics: [],
        },
        {
          monthIndex: 2,
          goal: "第二月",
          learningTasks: [{ id: "m2", title: "第二月任务", dueWeek: 2, estimatedHours: 4, status: "not_started" }],
          practiceOutputs: [],
          evaluationMetrics: [],
        },
      ]),
    });

    const { tasks, summary } = planTaskSummaryFromRow(source, 6);
    expect(tasks.map((task) => task.dueWeek)).toEqual([2, 6]);
    expect(summary.budgetStatus).toBe("within");
    expect(summary.overBudgetWeeks).toEqual([]);
  });

  it("checks budget across the whole plan and reports unknown scheduled hours", () => {
    const makeTask = (id: string, week: number, hours: number | null, status: "done" | "not_started" = "not_started") => ({
      id, title: id, description: "", type: "practice", status, estimatedHours: hours,
      cadence: null, resources: [], phaseId: null, phaseTitle: null, dueWeek: week,
      outputs: [], acceptanceCriteria: [], order: 0, sourceVersion: 2 as const,
    });

    const over = summarizePlanTasks([
      makeTask("done-week-1", 1, 2, "done"),
      makeTask("future-week-8", 8, 20),
    ], 6, 1);
    expect(over.budgetStatus).toBe("over");
    expect(over.overBudgetWeeks).toEqual([8]);

    const unknown = summarizePlanTasks([
      makeTask("known", 1, 2),
      makeTask("unknown", 1, null),
    ], 6, 1);
    expect(unknown.budgetStatus).toBe("unknown");
    expect(unknown.budgetMessage).toContain("无法确认");
  });

  it("updates a V2 action in content and regenerates compatibility months", () => {
    const source = row({ schemaVersion: 2, content: JSON.stringify(planV2()) });
    const result = updateUnifiedPlanTaskStatus(source, "v2-action-1", "done");

    expect(result.kind).toBe("updated");
    if (result.kind !== "updated") return;
    expect(result.previousStatus).toBe("not_started");
    expect(result.schemaVersion).toBe(2);
    const content = JSON.parse(result.content ?? "{}");
    expect(content.phases[0].actions[0].status).toBe("done");
    expect(JSON.parse(result.months ?? "[]")[0].learningTasks[0].status).toBe("done");
  });

  it("keeps unknown data out of page-facing summaries", () => {
    const { tasks, summary } = planTaskSummaryFromRow(row({ months: "[]" }), null);
    expect(tasks).toEqual([]);
    expect(summary.completionRate).toBeNull();
    expect(summary.weeklyBudgetHours).toBeNull();
    expect(summary.missingReasons.length).toBeGreaterThan(0);
  });
});

describe("Plan V2 quality gate", () => {
  it("accepts concrete actions with time, output and acceptance criteria", () => {
    expect(assessPlanV2Quality(planV2())).toEqual([]);
  });

  it("rejects vague knowledge-point and output-only actions", () => {
    const invalid = planV2({
      phases: [{
        ...planV2().phases[0],
        outputs: [],
        evaluationCriteria: [],
        actions: [{
          id: "vague-1",
          title: "完成一个知识点",
          description: "",
          type: "learning",
          status: "not_started",
          resources: [],
        }],
      }],
      immediateActions: [],
    });

    const codes = assessPlanV2Quality(invalid).map((issue) => issue.code);
    expect(codes).toContain("VAGUE_ACTION");
    expect(codes).toContain("MISSING_DESCRIPTION");
    expect(codes).toContain("MISSING_TIME");
    expect(codes).toContain("MISSING_OUTPUT");
    expect(codes).toContain("MISSING_ACCEPTANCE");
  });

  it("rejects a concrete-sounding action that still lacks time, output or acceptance", () => {
    const invalid = planV2({
      phases: [{
        ...planV2().phases[0],
        outputs: [],
        evaluationCriteria: [],
        actions: [{
          id: "incomplete-1",
          title: "学习 SQL",
          description: "阅读 SQL 基础教程",
          type: "learning",
          status: "not_started",
          resources: [],
        }],
      }],
      immediateActions: [],
    });

    const codes = assessPlanV2Quality(invalid).map((issue) => issue.code);
    expect(codes).toEqual(["MISSING_TIME", "MISSING_OUTPUT", "MISSING_ACCEPTANCE"]);
  });
});
