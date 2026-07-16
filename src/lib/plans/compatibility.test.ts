import { describe, expect, it } from "vitest";
import {
  readPlanV1,
  readPlanV2,
  readPlan,
  isPlanV2,
  updateV1TaskStatus,
  updateV2ActionStatus,
  serializePlanV2,
  convertV2ToV1Arrays,
} from "./compatibility";
import type { CareerPlanRow } from "./compatibility";
import type { AiCareerPlanV2 } from "./schema-v2";

// ── 辅助 ────────────────────────────────────────

function makeRow(overrides: Partial<CareerPlanRow> = {}): CareerPlanRow {
  return {
    id: "plan-1",
    userId: "user-1",
    targetRole: "database_administrator",
    targetRoleLabel: "数据库管理员（DBA）",
    version: 1,
    status: "active",
    schemaVersion: 1,
    content: "{}",
    parentPlanId: null,
    activatedAt: null,
    years: JSON.stringify([{ yearIndex: 1, goal: "入门" }]),
    quarters: JSON.stringify([{ quarterIndex: 1, goal: "Q1" }]),
    months: JSON.stringify([
      {
        monthIndex: 1,
        goal: "基础建立",
        learningTasks: [
          { id: "task-1", title: "学习SQL", type: "learn", status: "in_progress" },
          { id: "task-2", title: "练习", type: "practice", status: "not_started" },
        ],
      },
    ]),
    currentMonthIndex: 1,
    assumptions: JSON.stringify(["每周10小时"]),
    riskNotes: JSON.stringify(["时间不足"]),
    generationMeta: "{}",
    ...overrides,
  };
}

function makeV2Plan(overrides: Partial<AiCareerPlanV2> = {}): AiCareerPlanV2 {
  return {
    schemaVersion: 2,
    title: "DBA学习计划",
    targetRole: { key: "database_administrator", label: "数据库管理员（DBA）" },
    summary: "8周入门DBA",
    horizon: { value: 8, unit: "week" },
    phases: [
      {
        id: "phase-1",
        title: "基础阶段",
        objective: "掌握SQL",
        duration: { value: 4, unit: "week" },
        skills: ["SQL"],
        actions: [
          {
            id: "action-1",
            title: "学习SQL基础",
            description: "完成SQL教程",
            type: "learning",
            status: "in_progress",
            resources: [],
          },
        ],
        outputs: ["SQL笔记"],
        evaluationCriteria: ["能写复杂查询"],
        risks: [],
      },
    ],
    immediateActions: [
      {
        id: "imm-1",
        title: "注册SQL课程",
        description: "在Coursera注册",
        type: "learning",
        status: "not_started",
        resources: [],
      },
    ],
    assumptions: ["每周10小时"],
    riskNotes: ["时间可能不足"],
    evidenceRefs: ["citation_0"],
    ...overrides,
  };
}

// ── 测试 ────────────────────────────────────────

describe("readPlanV1", () => {
  it("解析旧 V1 字段", () => {
    const row = makeRow();
    const v1 = readPlanV1(row);
    expect(v1.schemaVersion).toBe(1);
    expect(v1.years).toHaveLength(1);
    expect(v1.months).toHaveLength(1);
    expect(v1.months[0]).toHaveProperty("learningTasks");
  });
});

describe("readPlanV2", () => {
  it("V1 计划返回 null", () => {
    const row = makeRow({ schemaVersion: 1 });
    expect(readPlanV2(row)).toBeNull();
  });

  it("V2 计划正确解析", () => {
    const v2Plan = makeV2Plan();
    const row = makeRow({
      schemaVersion: 2,
      content: JSON.stringify(v2Plan),
    });
    const parsed = readPlanV2(row);
    expect(parsed).not.toBeNull();
    expect(parsed!.schemaVersion).toBe(2);
    expect(parsed!.phases).toHaveLength(1);
    expect(parsed!.horizon.unit).toBe("week");
  });

  it("损坏的 content 返回 null", () => {
    const row = makeRow({ schemaVersion: 2, content: "{invalid" });
    expect(readPlanV2(row)).toBeNull();
  });
});

describe("readPlan", () => {
  it("自动选择 V2 优先", () => {
    const v2Plan = makeV2Plan();
    const row = makeRow({
      schemaVersion: 2,
      content: JSON.stringify(v2Plan),
    });
    const result = readPlan(row);
    expect("schemaVersion" in result && result.schemaVersion).toBe(2);
  });

  it("V2 损坏时降级到 V1", () => {
    const row = makeRow({ schemaVersion: 2, content: "garbage" });
    const result = readPlan(row);
    expect("schemaVersion" in result && result.schemaVersion).toBe(1);
  });
});

describe("isPlanV2", () => {
  it("schemaVersion >= 2 → true", () => {
    expect(isPlanV2(makeRow({ schemaVersion: 2 }))).toBe(true);
  });

  it("schemaVersion < 2 → false", () => {
    expect(isPlanV2(makeRow({ schemaVersion: 1 }))).toBe(false);
  });
});

describe("updateV1TaskStatus", () => {
  it("更新指定月份的任务状态", () => {
    const row = makeRow();
    const v1 = readPlanV1(row);
    const updated = updateV1TaskStatus(v1, 0, "task-1", "done");
    const tasks = (updated.months[0] as any).learningTasks;
    expect(tasks[0].status).toBe("done");
    expect(tasks[1].status).toBe("not_started");
  });
});

describe("updateV2ActionStatus", () => {
  it("更新 phase 中的 action 状态", () => {
    const plan = makeV2Plan();
    const updated = updateV2ActionStatus(plan, "action-1", "done");
    expect(updated.phases[0].actions[0].status).toBe("done");
  });

  it("更新 immediateActions 中的 action", () => {
    const plan = makeV2Plan();
    const updated = updateV2ActionStatus(plan, "imm-1", "in_progress");
    expect(updated.immediateActions[0].status).toBe("in_progress");
  });
});

describe("serializePlanV2", () => {
  it("序列化后可以 JSON.parse", () => {
    const plan = makeV2Plan();
    const serialized = serializePlanV2(plan);
    expect(() => JSON.parse(serialized)).not.toThrow();
    const parsed = JSON.parse(serialized);
    expect(parsed.schemaVersion).toBe(2);
  });
});

describe("convertV2ToV1Arrays", () => {
  it("6个月3阶段 → 不生成72个月", () => {
    const v2 = makeV2Plan({
      horizon: { value: 6, unit: "month" },
      phases: [
        {
          id: "p1", title: "基础", objective: "入门",
          duration: { value: 2, unit: "month" },
          skills: [], actions: [{ id: "a1", title: "学SQL", description: "", type: "learning", status: "not_started", resources: [] }],
          outputs: [], evaluationCriteria: [], risks: [],
        },
        {
          id: "p2", title: "进阶", objective: "深入",
          duration: { value: 2, unit: "month" },
          skills: [], actions: [{ id: "a2", title: "学优化", description: "", type: "learning", status: "not_started", resources: [] }],
          outputs: [], evaluationCriteria: [], risks: [],
        },
        {
          id: "p3", title: "实战", objective: "项目",
          duration: { value: 2, unit: "month" },
          skills: [], actions: [{ id: "a3", title: "做项目", description: "", type: "project", status: "not_started", resources: [] }],
          outputs: [], evaluationCriteria: [], risks: [],
        },
      ],
    });
    const result = convertV2ToV1Arrays(v2);
    expect(result.months.length).toBe(6); // 不是72
    expect(result.quarters.length).toBe(2); // 6个月 = 2季度
    expect(result.years.length).toBe(1); // 6个月不足1年
    expect(result.months[0].learningTasks[0].title).toBe("学SQL");
    expect(result.months[3].learningTasks[0].title).toBe("学优化");
  });

  it("8周单阶段 → 约2个月", () => {
    const v2 = makeV2Plan({
      horizon: { value: 8, unit: "week" },
      phases: [
        {
          id: "p1", title: "冲刺", objective: "快速入门",
          duration: { value: 8, unit: "week" },
          skills: [], actions: [{ id: "a1", title: "速学SQL", description: "", type: "learning", status: "not_started", resources: [] }],
          outputs: [], evaluationCriteria: [], risks: [],
        },
      ],
    });
    const result = convertV2ToV1Arrays(v2);
    // 8周 ≈ 2个月
    expect(result.months.length).toBe(2);
    expect(result.months[0].learningTasks[0].title).toBe("速学SQL");
  });

  it("3年长周期 → 36个月", () => {
    const v2 = makeV2Plan({
      horizon: { value: 3, unit: "year" },
      phases: [
        {
          id: "p1", title: "第1年", objective: "入门",
          duration: { value: 12, unit: "month" },
          skills: [], actions: [{ id: "a1", title: "基础", description: "", type: "learning", status: "not_started", resources: [] }],
          outputs: [], evaluationCriteria: [], risks: [],
        },
        {
          id: "p2", title: "第2年", objective: "进阶",
          duration: { value: 12, unit: "month" },
          skills: [], actions: [{ id: "a2", title: "项目", description: "", type: "project", status: "not_started", resources: [] }],
          outputs: [], evaluationCriteria: [], risks: [],
        },
        {
          id: "p3", title: "第3年", objective: "精通",
          duration: { value: 12, unit: "month" },
          skills: [], actions: [{ id: "a3", title: "专家", description: "", type: "review", status: "not_started", resources: [] }],
          outputs: [], evaluationCriteria: [], risks: [],
        },
      ],
    });
    const result = convertV2ToV1Arrays(v2);
    expect(result.months.length).toBe(36);
    expect(result.years.length).toBe(3);
    expect(result.quarters.length).toBe(12);
  });

  it("8周4阶段 → ≈2个月无负分配", () => {
    const v2 = makeV2Plan({
      horizon: { value: 8, unit: "week" },
      phases: [
        { id: "p1", title: "P1", objective: "a", duration: { value: 2, unit: "week" }, skills: [], actions: [{ id: "a1", title: "A1", description: "", type: "learning", status: "not_started", resources: [] }], outputs: [], evaluationCriteria: [], risks: [] },
        { id: "p2", title: "P2", objective: "b", duration: { value: 2, unit: "week" }, skills: [], actions: [{ id: "a2", title: "A2", description: "", type: "learning", status: "not_started", resources: [] }], outputs: [], evaluationCriteria: [], risks: [] },
        { id: "p3", title: "P3", objective: "c", duration: { value: 2, unit: "week" }, skills: [], actions: [{ id: "a3", title: "A3", description: "", type: "learning", status: "not_started", resources: [] }], outputs: [], evaluationCriteria: [], risks: [] },
        { id: "p4", title: "P4", objective: "d", duration: { value: 2, unit: "week" }, skills: [], actions: [{ id: "a4", title: "A4", description: "", type: "learning", status: "not_started", resources: [] }], outputs: [], evaluationCriteria: [], risks: [] },
      ],
    });
    const result = convertV2ToV1Arrays(v2);
    expect(result.months.length).toBe(2); // 8周≈2月，不是72月
    expect(result.months.every((m: any) => m.monthIndex > 0)).toBe(true);
  });

  it("1月3阶段 → 3个月无负分配", () => {
    const v2 = makeV2Plan({
      horizon: { value: 1, unit: "month" },
      phases: [
        { id: "p1", title: "P1", objective: "a", duration: { value: 10, unit: "day" }, skills: [], actions: [{ id: "a1", title: "A1", description: "", type: "learning", status: "not_started", resources: [] }], outputs: [], evaluationCriteria: [], risks: [] },
        { id: "p2", title: "P2", objective: "b", duration: { value: 10, unit: "day" }, skills: [], actions: [{ id: "a2", title: "A2", description: "", type: "learning", status: "not_started", resources: [] }], outputs: [], evaluationCriteria: [], risks: [] },
        { id: "p3", title: "P3", objective: "c", duration: { value: 10, unit: "day" }, skills: [], actions: [{ id: "a3", title: "A3", description: "", type: "learning", status: "not_started", resources: [] }], outputs: [], evaluationCriteria: [], risks: [] },
      ],
    });
    const result = convertV2ToV1Arrays(v2);
    expect(result.months.length).toBe(1); // 精确=1月
    expect(result.months.every((m: any) => m.monthIndex > 0)).toBe(true);
  });

  it("空 actions 使用 phase 标题作为月份目标", () => {
    const v2 = makeV2Plan({
      horizon: { value: 1, unit: "month" },
      phases: [
        {
          id: "p1", title: "准备期", objective: "准备",
          duration: { value: 1, unit: "month" },
          skills: [], actions: [],
          outputs: ["准备材料"], evaluationCriteria: [], risks: [],
        },
      ],
    });
    const result = convertV2ToV1Arrays(v2);
    expect(result.months.length).toBe(1);
    expect(result.months[0].goal).toContain("准备");
  });
});
