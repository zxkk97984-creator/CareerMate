import { describe, expect, it } from "vitest";
import {
  aiCareerPlanV2Schema,
  planPhaseV2Schema,
  planActionV2Schema,
  planDurationSchema,
} from "./schema-v2";

describe("planDurationSchema", () => {
  it("accepts 8 weeks", () => {
    const result = planDurationSchema.safeParse({ value: 8, unit: "week" });
    expect(result.success).toBe(true);
  });

  it("accepts 6 months", () => {
    const result = planDurationSchema.safeParse({ value: 6, unit: "month" });
    expect(result.success).toBe(true);
  });

  it("accepts 3 years", () => {
    const result = planDurationSchema.safeParse({ value: 3, unit: "year" });
    expect(result.success).toBe(true);
  });

  it("rejects value=0", () => {
    const result = planDurationSchema.safeParse({ value: 0, unit: "month" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid unit", () => {
    const result = planDurationSchema.safeParse({ value: 5, unit: "quarter" as never });
    expect(result.success).toBe(false);
  });
});

describe("planActionV2Schema", () => {
  it("accepts valid action", () => {
    const result = planActionV2Schema.safeParse({
      id: "act1",
      title: "学习SQL基础",
      description: "掌握SELECT/INSERT/UPDATE/DELETE",
      type: "learning",
      status: "not_started",
      estimatedHours: 20,
      resources: ["https://sql-tutorial.com"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts minimal action", () => {
    const result = planActionV2Schema.safeParse({
      id: "act2",
      title: "搭建Linux环境",
      description: "安装虚拟机",
      type: "practice",
      status: "not_started",
      resources: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid type", () => {
    const result = planActionV2Schema.safeParse({
      id: "act3",
      title: "X",
      description: "X",
      type: "invalid" as never,
      status: "not_started",
      resources: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("planPhaseV2Schema", () => {
  it("accepts valid phase with multiple actions", () => {
    const result = planPhaseV2Schema.safeParse({
      id: "phase1",
      title: "基础阶段",
      objective: "掌握数据库基础",
      duration: { value: 2, unit: "month" },
      skills: ["SQL", "NoSQL"],
      actions: [
        { id: "a1", title: "SQL课程", description: "...", type: "learning", status: "not_started", resources: [] },
        { id: "a2", title: "动手实验", description: "...", type: "practice", status: "not_started", resources: [] },
      ],
      outputs: ["能独立设计数据库"],
      evaluationCriteria: ["通过认证考试"],
      risks: ["时间不足"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects phase with more than 20 actions", () => {
    const actions = Array.from({ length: 21 }, (_, i) => ({
      id: `a${i}`,
      title: `Action ${i}`,
      description: "...",
      type: "learning" as const,
      status: "not_started" as const,
      resources: [],
    }));
    const result = planPhaseV2Schema.safeParse({
      id: "phase_big",
      title: "超大阶段",
      objective: "...",
      duration: { value: 1, unit: "month" },
      skills: [],
      actions,
      outputs: [],
      evaluationCriteria: [],
      risks: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("aiCareerPlanV2Schema", () => {
  it("accepts 8-week DBA plan", () => {
    const eightWeekDbaPlan = {
      schemaVersion: 2,
      title: "DBA 入门规划",
      targetRole: { key: "database_administrator", label: "数据库管理员（DBA）" },
      summary: "8周掌握DBA核心技能",
      horizon: { value: 8, unit: "week" },
      phases: [
        {
          id: "p1",
          title: "SQL基础",
          objective: "掌握SQL增删改查",
          duration: { value: 2, unit: "week" },
          skills: ["SQL"],
          actions: [
            { id: "a1", title: "SQL入门", description: "学习基础查询", type: "learning", status: "not_started", resources: [] },
          ],
          outputs: ["SQL能力"],
          evaluationCriteria: ["通过测试"],
          risks: [],
        },
        {
          id: "p2",
          title: "数据库管理",
          objective: "学习数据库运维",
          duration: { value: 3, unit: "week" },
          skills: ["运维"],
          actions: [
            { id: "a2", title: "安装MySQL", description: "...", type: "practice", status: "not_started", resources: [] },
          ],
          outputs: ["运维能力"],
          evaluationCriteria: [],
          risks: [],
        },
      ],
      immediateActions: [],
      assumptions: [],
      riskNotes: [],
      evidenceRefs: [],
    };
    const result = aiCareerPlanV2Schema.safeParse(eightWeekDbaPlan);
    expect(result.success).toBe(true);
  });

  it("accepts 3-year 5-phase plan (not fixed to 12 quarters/36 months)", () => {
    const threeYearFivePhasePlan = {
      schemaVersion: 2,
      title: "高级DBA成长路线",
      targetRole: { key: "database_administrator", label: "数据库管理员（DBA）" },
      summary: "3年从初级到高级DBA",
      horizon: { value: 3, unit: "year" },
      phases: [
        {
          id: "p1", title: "阶段1", objective: "基础",
          duration: { value: 6, unit: "month" }, skills: ["SQL"],
          actions: [{ id: "a1", title: "SQL", description: "...", type: "learning", status: "not_started", resources: [] }],
          outputs: [], evaluationCriteria: [], risks: [],
        },
        {
          id: "p2", title: "阶段2", objective: "进阶",
          duration: { value: 6, unit: "month" }, skills: ["优化"],
          actions: [{ id: "a2", title: "优化", description: "...", type: "practice", status: "not_started", resources: [] }],
          outputs: [], evaluationCriteria: [], risks: [],
        },
        {
          id: "p3", title: "阶段3", objective: "高级",
          duration: { value: 12, unit: "month" }, skills: ["架构"],
          actions: [{ id: "a3", title: "架构", description: "...", type: "project", status: "not_started", resources: [] }],
          outputs: [], evaluationCriteria: [], risks: [],
        },
        {
          id: "p4", title: "阶段4", objective: "专家",
          duration: { value: 6, unit: "month" }, skills: ["管理"],
          actions: [{ id: "a4", title: "管理", description: "...", type: "review", status: "not_started", resources: [] }],
          outputs: [], evaluationCriteria: [], risks: [],
        },
        {
          id: "p5", title: "阶段5", objective: "领袖",
          duration: { value: 6, unit: "month" }, skills: ["战略"],
          actions: [{ id: "a5", title: "战略", description: "...", type: "application", status: "not_started", resources: [] }],
          outputs: [], evaluationCriteria: [], risks: [],
        },
      ],
      immediateActions: [],
      assumptions: [],
      riskNotes: [],
      evidenceRefs: [],
    };
    const result = aiCareerPlanV2Schema.safeParse(threeYearFivePhasePlan);
    expect(result.success).toBe(true);
  });

  it("rejects plan with duplicate action IDs", () => {
    const planWithDuplicateActionIds = {
      schemaVersion: 2,
      title: "重复ID计划",
      targetRole: { key: "dba", label: "DBA" },
      summary: "...",
      horizon: { value: 1, unit: "month" },
      phases: [
        {
          id: "p1", title: "阶段1", objective: "...",
          duration: { value: 1, unit: "week" }, skills: [],
          actions: [
            { id: "same_id", title: "Action 1", description: "...", type: "learning", status: "not_started", resources: [] },
            { id: "same_id", title: "Action 2", description: "...", type: "practice", status: "not_started", resources: [] },
          ],
          outputs: [], evaluationCriteria: [], risks: [],
        },
      ],
      immediateActions: [],
      assumptions: [],
      riskNotes: [],
      evidenceRefs: [],
    };
    const result = aiCareerPlanV2Schema.safeParse(planWithDuplicateActionIds);
    expect(result.success).toBe(false);
  });

  it("rejects plan with more than 8 phases", () => {
    const phases = Array.from({ length: 9 }, (_, i) => ({
      id: `p${i}`,
      title: `阶段${i}`,
      objective: "...",
      duration: { value: 1, unit: "week" as const },
      skills: [],
      actions: [{ id: `a${i}`, title: "X", description: "...", type: "learning" as const, status: "not_started" as const, resources: [] }],
      outputs: [],
      evaluationCriteria: [],
      risks: [],
    }));
    const result = aiCareerPlanV2Schema.safeParse({
      schemaVersion: 2,
      title: "太多阶段",
      targetRole: { key: "dba", label: "DBA" },
      summary: "...",
      horizon: { value: 1, unit: "year" },
      phases,
      immediateActions: [],
      assumptions: [],
      riskNotes: [],
      evidenceRefs: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects plan with more than 8 immediateActions", () => {
    const actions = Array.from({ length: 9 }, (_, i) => ({
      id: `ia${i}`,
      title: `Action ${i}`,
      description: "...",
      type: "learning" as const,
      status: "not_started" as const,
      resources: [],
    }));
    const result = aiCareerPlanV2Schema.safeParse({
      schemaVersion: 2,
      title: "太多立即行动",
      targetRole: { key: "dba", label: "DBA" },
      summary: "...",
      horizon: { value: 1, unit: "month" },
      phases: [],
      immediateActions: actions,
      assumptions: [],
      riskNotes: [],
      evidenceRefs: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid schemaVersion", () => {
    const result = aiCareerPlanV2Schema.safeParse({
      schemaVersion: 1,
      title: "V1计划",
      targetRole: { key: "dba", label: "DBA" },
      summary: "...",
      horizon: { value: 1, unit: "year" },
      phases: [],
      immediateActions: [],
      assumptions: [],
      riskNotes: [],
      evidenceRefs: [],
    });
    expect(result.success).toBe(false);
  });
});
