import { describe, expect, it, vi } from "vitest";
import { resolveAgentArtifactCandidate } from "./candidate-resolution";
import type { AgentArtifactCandidateType } from "./candidate-service";

const validArtifact = {
  schemaVersion: "1.0" as const,
  taskType: "career_plan" as const,
  status: "pending_confirmation" as const,
  summary: "三年计划候选",
  data: { targetRole: "data_analyst", phases: [] },
  evidence: [],
  sources: [],
  assumptions: [],
  warnings: [],
  requiresUserConfirmation: true,
  baseVersion: 3,
  nextActions: [],
};

function makeFakeDb(overrides: Record<string, unknown> = {}) {
  const defaultCandidate = {
    id: "c1",
    userId: "u1",
    candidateType: "career_plan" as AgentArtifactCandidateType,
    status: "pending",
    artifact: JSON.stringify(validArtifact),
    baseVersion: 3,
    sourceSessionId: "session-1",
    sourceConversationId: "conv-1",
    resolvedAt: null,
  };

  const resolveCandidate = () => {
    if (overrides.candidate === null) return null;
    return (overrides.candidate as typeof defaultCandidate) ?? defaultCandidate;
  };

  const makeTransaction = () => ({
    agentArtifactCandidate: {
      findFirst: vi.fn().mockResolvedValue(resolveCandidate()),
      update: vi.fn().mockResolvedValue({ ...defaultCandidate, status: "rejected" as const }),
    },
    careerPlan: {
      findFirst: vi.fn().mockResolvedValue({ id: "plan-1", version: 3 }),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    userProfile: {
      findUnique: vi.fn().mockResolvedValue({ version: 3 }),
      update: vi.fn(),
    },
    abilityEvidence: { create: vi.fn() },
    memoryItem: { create: vi.fn() },
    roleDraft: { create: vi.fn() },
  });

  return {
    agentArtifactCandidate: {
      findFirst: vi.fn().mockResolvedValue(resolveCandidate()),
      update: vi.fn().mockResolvedValue({ ...defaultCandidate, status: "rejected" as const }),
    },
    careerPlan: {
      findFirst: vi.fn().mockResolvedValue({ id: "plan-1", version: 3 }),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    userProfile: {
      findUnique: vi.fn().mockResolvedValue({ version: 3 }),
      update: vi.fn(),
    },
    abilityEvidence: { create: vi.fn() },
    memoryItem: { create: vi.fn() },
    roleDraft: { create: vi.fn() },
    $transaction: vi.fn().mockImplementation((fn: any) => fn(makeTransaction())),
  };
}

describe("候选解析服务", () => {
  it("幂等地拒绝一个待确认候选", async () => {
    const db = makeFakeDb();
    const first = await resolveAgentArtifactCandidate(
      { userId: "u1", candidateId: "c1", decision: "reject" },
      { db: db as any },
    );
    expect(first.status).toBe("rejected");

    // 第二次调用应返回相同结果
    const existingDb = makeFakeDb({
      candidate: {
        id: "c1", userId: "u1", candidateType: "career_plan",
        status: "rejected", artifact: JSON.stringify(validArtifact),
        baseVersion: 3, sourceSessionId: "session-1",
        sourceConversationId: "conv-1", resolvedAt: new Date().toISOString(),
      },
    });
    const second = await resolveAgentArtifactCandidate(
      { userId: "u1", candidateId: "c1", decision: "reject" },
      { db: existingDb as any },
    );
    expect(second.status).toBe("rejected");
  });

  it("拒绝不属于该用户的候选", async () => {
    const db = makeFakeDb({ candidate: null });
    await expect(
      resolveAgentArtifactCandidate(
        { userId: "u2", candidateId: "c1", decision: "accept" },
        { db: db as any },
      ),
    ).rejects.toMatchObject({ code: "CANDIDATE_NOT_FOUND", status: 404 });
  });

  it("已解决的候选收到相反决定时返回 409", async () => {
    const db = makeFakeDb({
      candidate: {
        id: "c1", userId: "u1", candidateType: "career_plan",
        status: "rejected", artifact: JSON.stringify(validArtifact),
        baseVersion: 3, sourceSessionId: "session-1",
        sourceConversationId: "conv-1", resolvedAt: new Date().toISOString(),
      },
    });
    await expect(
      resolveAgentArtifactCandidate(
        { userId: "u1", candidateId: "c1", decision: "accept" },
        { db: db as any },
      ),
    ).rejects.toMatchObject({ code: "CANDIDATE_ALREADY_RESOLVED", status: 409 });
  });

  it("baseVersion 不匹配时拒绝接受", async () => {
    const db = makeFakeDb();
    // 重写 $transaction 使事务内的 userProfile 返回版本 7
    db.$transaction.mockImplementation((fn: any) => fn({
      agentArtifactCandidate: {
        findFirst: vi.fn().mockResolvedValue({
          id: "c1", userId: "u1", candidateType: "career_plan",
          status: "pending", artifact: JSON.stringify(validArtifact),
          baseVersion: 3, sourceSessionId: "session-1",
          sourceConversationId: "conv-1", resolvedAt: null,
        }),
        update: vi.fn(),
      },
      careerPlan: { findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
      userProfile: { findUnique: vi.fn().mockResolvedValue({ version: 7 }), update: vi.fn() },
      abilityEvidence: { create: vi.fn() },
      memoryItem: { create: vi.fn() },
      roleDraft: { create: vi.fn() },
    }));

    await expect(
      resolveAgentArtifactCandidate(
        { userId: "u1", candidateId: "c1", decision: "accept" },
        { db: db as any },
      ),
    ).rejects.toMatchObject({ code: "BASE_VERSION_CONFLICT", status: 409 });
  });
});
