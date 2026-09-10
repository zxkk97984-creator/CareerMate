import { describe, expect, it, vi } from "vitest";
import type { AgentArtifactCandidateService } from "@/lib/agentic-v2/candidate-service";
import type { CareerPlanRow } from "./compatibility";
import { createTaskResourceAssociation } from "./resource-association";

const plan = {
  schemaVersion: 2,
  title: "数据分析计划",
  targetRole: { key: "data_analyst", label: "数据分析师" },
  summary: "完成 SQL 练习",
  horizon: { value: 4, unit: "week" },
  phases: [{
    id: "phase-1",
    title: "查询基础",
    objective: "掌握聚合查询",
    duration: { value: 4, unit: "week" },
    skills: ["SQL"],
    actions: [{
      id: "task-1",
      title: "完成 10 道 SQL 聚合查询",
      description: "使用公开销售数据完成查询并记录过滤逻辑",
      type: "practice",
      status: "not_started",
      estimatedHours: 4,
      resources: [],
      outputs: ["10 道查询结果与说明"],
      acceptanceCriteria: ["能解释每个查询的分组和过滤条件"],
    }],
    outputs: ["10 道查询结果与说明"],
    evaluationCriteria: ["能解释每个查询的分组和过滤条件"],
    risks: [],
  }],
  immediateActions: [],
  assumptions: [],
  riskNotes: [],
  evidenceRefs: [],
};

function planRow(): CareerPlanRow {
  return {
    id: "plan-1",
    userId: "user-1",
    targetRole: "data_analyst",
    targetRoleLabel: "数据分析师",
    version: 3,
    status: "active",
    schemaVersion: 2,
    content: JSON.stringify(plan),
    parentPlanId: null,
    activatedAt: new Date("2026-09-01"),
    years: "[]",
    quarters: "[]",
    months: "[]",
    currentMonthIndex: 1,
    assumptions: "[]",
    riskNotes: "[]",
    generationMeta: "{}",
  };
}

function candidateService(): AgentArtifactCandidateService {
  return {
    createCandidate: vi.fn().mockResolvedValue({
      id: "candidate-1",
      status: "pending",
      candidateType: "career_plan",
    }),
    createCandidateInTx: vi.fn(),
  };
}

describe("task resource association", () => {
  it("creates a pending career_plan candidate with the resource reference", async () => {
    const service = candidateService();
    const result = await createTaskResourceAssociation({
      userId: "user-1",
      planId: "plan-1",
      taskId: "task-1",
      resourceId: "resource-1",
    }, {
      db: {
        careerPlan: { findFirst: vi.fn().mockResolvedValue(planRow()) },
        resourceItem: {
          findFirst: vi.fn().mockResolvedValue({
            id: "resource-1",
            title: "SQL 聚合查询公开课程",
            source: "公开来源",
            provider: "示例课程",
            url: "https://example.com/sql",
            verificationStatus: "verified",
          }),
        },
      },
      candidateService: service,
    });

    expect(result).toMatchObject({ kind: "pending", candidateId: "candidate-1" });
    const call = vi.mocked(service.createCandidate).mock.calls[0][0];
    const artifact = call.artifact as {
      baseVersion: number;
      data: { plan: { phases: Array<{ actions: Array<{ resources: string[] }> }> } };
    };
    expect(artifact.baseVersion).toBe(3);
    expect(artifact.data.plan.phases[0].actions[0].resources).toEqual([
      "resource:resource-1:SQL 聚合查询公开课程",
    ]);
  });

  it("does not create a duplicate candidate when the task already has the resource", async () => {
    const service = candidateService();
    const row = planRow();
    const existing = JSON.parse(JSON.stringify(plan));
    existing.phases[0].actions[0].resources = ["resource:resource-1:SQL 聚合查询公开课程"];
    row.content = JSON.stringify(existing);

    const result = await createTaskResourceAssociation({
      userId: "user-1",
      planId: "plan-1",
      taskId: "task-1",
      resourceId: "resource-1",
    }, {
      db: {
        careerPlan: { findFirst: vi.fn().mockResolvedValue(row) },
        resourceItem: {
          findFirst: vi.fn().mockResolvedValue({
            id: "resource-1",
            title: "SQL 聚合查询公开课程",
            source: "公开来源",
            provider: "示例课程",
            url: "https://example.com/sql",
            verificationStatus: "verified",
          }),
        },
      },
      candidateService: service,
    });

    expect(result).toMatchObject({ kind: "unchanged", candidateId: null });
    expect(service.createCandidate).not.toHaveBeenCalled();
  });

  it("rejects resources whose source policy is not allowed", async () => {
    const service = candidateService();
    await expect(createTaskResourceAssociation({
      userId: "user-1",
      planId: "plan-1",
      taskId: "task-1",
      resourceId: "resource-1",
    }, {
      db: {
        careerPlan: { findFirst: vi.fn().mockResolvedValue(planRow()) },
        resourceItem: {
          findFirst: vi.fn().mockResolvedValue({
            id: "resource-1",
            title: "来源不明课程",
            source: "来源不明转载",
            provider: null,
            url: "https://example.com/unknown",
            verificationStatus: "unverified",
          }),
        },
      },
      candidateService: service,
    })).rejects.toMatchObject({ code: "RESOURCE_SOURCE_NOT_ALLOWED", status: 403 });
    expect(service.createCandidate).not.toHaveBeenCalled();
  });
});
