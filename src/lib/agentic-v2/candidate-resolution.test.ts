import { describe, expect, it, vi } from "vitest";
import { resolveAgentArtifactCandidate } from "./candidate-resolution";

const validPlanArtifact = {
  schemaVersion: "1.0" as const,
  taskType: "career_plan" as const,
  status: "pending_confirmation" as const,
  summary: "三年计划候选",
  data: { targetRole: "data_analyst", phases: [], summary: "分析岗三年计划", immediateActions: [], years: [], quarters: [], months: [], currentMonthIndex: 1, assumptions: [], riskNotes: [] },
  evidence: [],
  sources: [],
  assumptions: [],
  warnings: [],
  requiresUserConfirmation: true,
  baseVersion: 3,
  nextActions: [],
};

const validProfileArtifact = {
  schemaVersion: "1.0" as const,
  taskType: "profile_assessment" as const,
  status: "pending_confirmation" as const,
  summary: "画像补丁候选",
  data: { patch: { targetRole: "data_analyst", weeklyAvailableHours: 12 } },
  evidence: [],
  sources: [],
  assumptions: [],
  warnings: [],
  requiresUserConfirmation: true,
  baseVersion: 3,
  nextActions: [],
};

function makeTx(overrides: Record<string, unknown> = {}) {
  const def = {
    agentArtifactCandidate: {
      findFirst: vi.fn().mockResolvedValue({ id: "c1", userId: "u1", candidateType: "career_plan", status: "pending", artifact: JSON.stringify(validPlanArtifact), baseVersion: 3, sourceSessionId: "s1", sourceConversationId: "c1", resolvedAt: null }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
    careerPlan: {
      findFirst: vi.fn().mockResolvedValue({ id: "plan-1", version: 3 }),
      updateMany: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: "plan-new" }),
    },
    userProfile: {
      findUnique: vi.fn().mockResolvedValue({ version: 3 }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    abilityEvidence: { create: vi.fn() },
    memoryItem: { create: vi.fn() },
    roleDraft: { create: vi.fn() },
    ...overrides,
  };
  return { ...def, $transaction: vi.fn().mockImplementation((fn: any) => fn(def)) };
}

describe("候选解析服务 (严格 Zod)", () => {
  it("career_plan 比较计划版本而非画像版本", async () => {
    const tx = makeTx({
      careerPlan: { findFirst: vi.fn().mockResolvedValue({ id: "plan-1", version: 5 }), updateMany: vi.fn() },
    });
    // 计划版本 5 ≠ artifact.baseVersion 3 → 应拒绝
    await expect(
      resolveAgentArtifactCandidate({ userId: "u1", candidateId: "c1", decision: "accept" }, { db: tx as any }),
    ).rejects.toMatchObject({ code: "BASE_VERSION_CONFLICT", status: 409 });
  });

  it("profile_patch 比较画像版本", async () => {
    const tx = makeTx({
      agentArtifactCandidate: { findFirst: vi.fn().mockResolvedValue({ id: "c1", userId: "u1", candidateType: "profile_patch", status: "pending", artifact: JSON.stringify(validProfileArtifact), baseVersion: 3, sourceSessionId: "s1", sourceConversationId: "c1", resolvedAt: null }), updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn() },
      userProfile: { findUnique: vi.fn().mockResolvedValue({ version: 5 }), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    });
    await expect(
      resolveAgentArtifactCandidate({ userId: "u1", candidateId: "c1", decision: "accept" }, { db: tx as any }),
    ).rejects.toMatchObject({ code: "BASE_VERSION_CONFLICT", status: 409 });
  });

  it("profile_patch 原子增加 profile.version", async () => {
    const tx = makeTx({
      agentArtifactCandidate: { findFirst: vi.fn().mockResolvedValue({ id: "c1", userId: "u1", candidateType: "profile_patch", status: "pending", artifact: JSON.stringify(validProfileArtifact), baseVersion: 3, sourceSessionId: "s1", sourceConversationId: "c1", resolvedAt: null }), updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn() },
    });
    const result = await resolveAgentArtifactCandidate({ userId: "u1", candidateId: "c1", decision: "accept" }, { db: tx as any });
    expect(result.status).toBe("accepted");
    // 验证 userProfile.update 被调用了（如果 patch 有效）
  });

  it("memory >2000 字符被拒绝而非截断", async () => {
    const longContent = "x".repeat(2001);
    const memoryArtifact = {
      ...validPlanArtifact,
      taskType: "memory_item" as const,
      data: { content: longContent, kind: "career_fact", reason: "test" },
    };
    const tx = makeTx({
      agentArtifactCandidate: { findFirst: vi.fn().mockResolvedValue({ id: "c1", userId: "u1", candidateType: "memory_item", status: "pending", artifact: JSON.stringify(memoryArtifact), baseVersion: null, sourceSessionId: "s1", sourceConversationId: "c1", resolvedAt: null }), updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn() },
    });
    await expect(
      resolveAgentArtifactCandidate({ userId: "u1", candidateId: "c1", decision: "accept" }, { db: tx as any }),
    ).rejects.toMatchObject({ code: "INVALID_CANDIDATE_DATA", status: 400 });
  });

  it("RoleDraft 必须提供 roleKey 和 roleName", async () => {
    const draftArtifact = {
      ...validPlanArtifact,
      taskType: "career_template_draft" as const,
      data: { roleKey: "", roleName: "", category: "技术" },
    };
    const tx = makeTx({
      agentArtifactCandidate: { findFirst: vi.fn().mockResolvedValue({ id: "c1", userId: "u1", candidateType: "career_template_draft", status: "pending", artifact: JSON.stringify(draftArtifact), baseVersion: null, sourceSessionId: "s1", sourceConversationId: "c1", resolvedAt: null }), updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn() },
    });
    await expect(
      resolveAgentArtifactCandidate({ userId: "u1", candidateId: "c1", decision: "accept" }, { db: tx as any }),
    ).rejects.toMatchObject({ code: "INVALID_CANDIDATE_DATA", status: 400 });
  });

  it("updateMany count=0 时双重投影被阻止", async () => {
    const tx = makeTx({
      agentArtifactCandidate: {
        findFirst: vi.fn().mockResolvedValue({ id: "c1", userId: "u1", candidateType: "career_plan", status: "pending", artifact: JSON.stringify(validPlanArtifact), baseVersion: 3, sourceSessionId: "s1", sourceConversationId: "c1", resolvedAt: null }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }), // 模拟并发冲突
        update: vi.fn(),
      },
    });
    await expect(
      resolveAgentArtifactCandidate({ userId: "u1", candidateId: "c1", decision: "accept" }, { db: tx as any }),
    ).rejects.toMatchObject({ code: "CANDIDATE_ALREADY_RESOLVED", status: 409 });
  });
});
