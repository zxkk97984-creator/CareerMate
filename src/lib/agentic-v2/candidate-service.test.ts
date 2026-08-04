import { describe, expect, it, vi } from "vitest";
import type { AgentArtifactV1 } from "./contracts";
import {
  AGENT_ARTIFACT_CANDIDATE_TYPES,
  AgentArtifactCandidateError,
  createAgentArtifactCandidateService,
} from "./candidate-service";

/** taskType → 最常见 candidateType 映射（用于未指定 _candidateType 时的回退） */
const DEFAULT_CANDIDATE_FOR_TASK: Record<string, string> = {
  profile_assessment: "profile_assessment",
  career_plan: "career_plan",
  learning_route: "learning_route",
  simulation_report: "ability_evidence",
  resume_review: "ability_evidence",
  growth_review: "growth_replan",
  memory_item: "memory_item",
  career_exploration: "career_template_draft",
  career_template_draft: "career_template_draft",
};

function samplePlan() {
  return {
    schemaVersion: 2 as const,
    title: "测试职业计划",
    targetRole: { key: "ai_product_manager", label: "AI 产品经理" },
    summary: "测试计划摘要",
    horizon: { value: 3, unit: "year" as const },
    phases: [{ id: "phase-1", title: "基础期", objective: "建立基础", duration: { value: 6, unit: "month" as const }, skills: [], actions: [{ id: "a1", title: "学习 PRD", description: "PRD 基础", type: "learning" as const, status: "not_started" as const, resources: [] }], outputs: [], evaluationCriteria: [], risks: [] }],
    immediateActions: [],
    assumptions: [],
    riskNotes: [],
    evidenceRefs: [],
  };
}

/** 按 candidateType 生成合法的最小 data 值，通过预创建 Schema 验证 */
function validDataForCandidateType(candidateType: string): Record<string, unknown> {
  // 候选类型对应的 taskType 默认 data
  switch (candidateType) {
    case "profile_patch":
      return { patch: { experienceSummary: "测试摘要" } };
    case "profile_assessment":
      return { patch: { experienceSummary: "测试摘要" }, scores: { aiTooling: { value: 72, evidence: "测试中表现优秀" } }, strengths: ["学习能力强"] };
    case "ability_evidence":
      return { abilityEvidence: [{ abilityKey: "aiTooling", summary: "测试证据", sourceType: "simulation", confidence: 0.8 }] };
    case "career_plan":
      return { plan: samplePlan() };
    case "learning_route":
      return { targetRole: "ai_product_manager", stages: [], baseRouteVersion: null };
    case "growth_replan":
      return { plan: samplePlan(), planPatch: { parentPlanId: "plan-old" } };
    case "memory_item":
      return { content: "测试记忆内容", kind: "career_fact" };
    case "career_template_draft":
      return { roleKey: "test_role", roleName: "测试角色" };
    // taskType 回退：当没有显式 _candidateType 时，按 taskType 生成 data
    case "simulation_report":
    case "resume_review":
      return { abilityEvidence: [{ abilityKey: "communication", summary: "测试证据", sourceType: "simulation", confidence: 0.8 }] };
    case "growth_review":
      return { plan: samplePlan() };
    case "career_exploration":
      return { options: [{ roleName: "测试岗位", roleKey: "test_role" }] };
    default:
      return {};
  }
}

function artifact(overrides: Partial<AgentArtifactV1> & { _candidateType?: string } = {}): AgentArtifactV1 {
  const taskType = (overrides.taskType ?? "career_plan") as string;
  // 优先使用显式 _candidateType，其次按 taskType 映射回退到最常见 candidateType
  const candType = overrides._candidateType as string | undefined;
  const effectiveCandType = candType ?? DEFAULT_CANDIDATE_FOR_TASK[taskType] ?? taskType;
  const { _candidateType: _ignored, data: explicitData, ...cleanOverrides } = overrides as Record<string, unknown>;
  void _ignored;
  let data = explicitData ?? validDataForCandidateType(effectiveCandType);
  // career_exploration 需同时满足 taskType schema（options 必填）和候选 schema
  if (!explicitData && taskType === "career_exploration" && !(data as Record<string, unknown>).options) {
    data = { options: [{ roleName: "测试岗位", roleKey: "test_role" }], ...(data as Record<string, unknown>) };
  }
  return {
    schemaVersion: "1.0",
    taskType: taskType as AgentArtifactV1["taskType"],
    status: "pending_confirmation",
    summary: "一份等待用户确认的职业计划候选",
    data,
    evidence: [],
    sources: [],
    assumptions: [],
    warnings: [],
    requiresUserConfirmation: true,
    baseVersion: 5,
    nextActions: [],
    ...cleanOverrides,
  } as unknown as AgentArtifactV1;
}

type StoredCandidate = {
  id: string;
  userId: string;
  idempotencyKey: string;
  status: string;
  candidateType: string;
  artifact: string;
  baseVersion: number | null;
  sourceConversationId: string | null;
  sourceSessionId: string;
};

function setup(options: { conversationOwnerId?: string | null; upsertError?: Error } = {}) {
  const rows = new Map<string, StoredCandidate>();
  const formalWrites = {
    userProfile: { update: vi.fn() },
    careerPlan: { create: vi.fn(), update: vi.fn() },
    abilityEvidence: { create: vi.fn(), update: vi.fn() },
    progressLog: { create: vi.fn(), update: vi.fn() },
  };
  const transaction = {
    chatConversation: {
      findFirst: vi.fn().mockResolvedValue(
        options.conversationOwnerId === null
          ? null
          : { id: "conversation-1", userId: options.conversationOwnerId ?? "user-1" },
      ),
    },
    agentArtifactCandidate: {
      upsert: vi.fn().mockImplementation(async (args: {
        where: {
          userId_sourceSessionId_idempotencyKey: {
            userId: string;
            sourceSessionId: string;
            idempotencyKey: string;
          };
        };
        create: Omit<StoredCandidate, "id">;
      }) => {
        if (options.upsertError) throw options.upsertError;
        const key = args.where.userId_sourceSessionId_idempotencyKey;
        const identity = `${key.userId}:${key.sourceSessionId}:${key.idempotencyKey}`;
        const existing = rows.get(identity);
        if (existing) return existing;
        const created = { id: `candidate-${rows.size + 1}`, ...args.create };
        rows.set(identity, created);
        return created;
      }),
    },
    ...formalWrites,
  };
  const db = {
    $transaction: vi.fn(async (callback: (client: typeof transaction) => unknown) => callback(transaction)),
    ...formalWrites,
  };
  const service = createAgentArtifactCandidateService({ db: db as never });
  return { db, formalWrites, rows, service, transaction };
}

function context(idempotencyKey = "request-1") {
  return {
    sessionId: "local-session-1",
    conversationId: "conversation-1",
    idempotencyKey,
  };
}

describe("AgentArtifactCandidateService", () => {
  it("publishes exactly the planned candidate type allowlist", () => {
    expect(AGENT_ARTIFACT_CANDIDATE_TYPES).toEqual([
      "profile_patch",
      "profile_assessment",
      "ability_evidence",
      "career_plan",
      "learning_route",
      "growth_replan",
      "memory_item",
      "career_template_draft",
    ]);
  });

  it("rejects candidate types outside the V2 allowlist before opening a transaction", async () => {
    const { db, service } = setup();

    await expect(service.createCandidate({
      userId: "user-1",
      context: context(),
      candidateType: "direct_profile_overwrite" as never,
      artifact: artifact(),
    })).rejects.toMatchObject({ code: "CANDIDATE_TYPE_NOT_ALLOWED", status: 400 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["a non-pending artifact", { status: "success" as const }, "ARTIFACT_NOT_PENDING"],
    ["an artifact that bypasses confirmation", { requiresUserConfirmation: false }, "INVALID_ARTIFACT"],
  ])("rejects %s", async (_label, overrides, expectedCode) => {
    const { db, service } = setup();

    await expect(service.createCandidate({
      userId: "user-1",
      context: context(),
      candidateType: "career_plan",
      artifact: artifact(overrides),
    })).rejects.toMatchObject({ code: expectedCode, status: 400 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("validates the artifact with the shared AgentArtifactV1 schema", async () => {
    const { db, service } = setup();

    await expect(service.createCandidate({
      userId: "user-1",
      context: context(),
      candidateType: "career_plan",
      artifact: { ...artifact(), schemaVersion: "2.0" },
    })).rejects.toBeInstanceOf(AgentArtifactCandidateError);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("requires an idempotency key before opening a transaction", async () => {
    const { db, service } = setup();

    await expect(service.createCandidate({
      userId: "user-1",
      context: { ...context(), idempotencyKey: "" },
      candidateType: "career_plan",
      artifact: artifact(),
    })).rejects.toMatchObject({ code: "INVALID_CONTEXT", status: 400 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a source conversation that does not belong to the user", async () => {
    const { service, transaction } = setup({ conversationOwnerId: null });

    await expect(service.createCandidate({
      userId: "user-1",
      context: context(),
      candidateType: "career_plan",
      artifact: artifact(),
    })).rejects.toMatchObject({ code: "CONVERSATION_NOT_FOUND", status: 404 });
    expect(transaction.chatConversation.findFirst).toHaveBeenCalledWith({
      where: { id: "conversation-1", userId: "user-1" },
      select: { id: true },
    });
    expect(transaction.agentArtifactCandidate.upsert).not.toHaveBeenCalled();
  });

  it("persists the validated artifact and source conversation without promoting it", async () => {
    const { db, formalWrites, service, transaction } = setup();
    const inputArtifact = artifact({ baseVersion: 7 });

    const result = await service.createCandidate({
      userId: "user-1",
      context: context("request-persist"),
      candidateType: "career_plan",
      artifact: inputArtifact,
    });

    expect(result).toEqual({ id: "candidate-1", status: "pending", candidateType: "career_plan" });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.agentArtifactCandidate.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        userId_sourceSessionId_idempotencyKey: {
          userId: "user-1",
          sourceSessionId: "local-session-1",
          idempotencyKey: "request-persist",
        },
      },
      create: {
        userId: "user-1",
        sourceSessionId: "local-session-1",
        idempotencyKey: "request-persist",
        candidateType: "career_plan",
        status: "pending",
        artifact: JSON.stringify(inputArtifact),
        baseVersion: 7,
        sourceConversationId: "conversation-1",
      },
      update: {},
      select: expect.objectContaining({ sourceSessionId: true }),
    }));
    for (const repository of Object.values(formalWrites)) {
      for (const operation of Object.values(repository)) expect(operation).not.toHaveBeenCalled();
    }
  });

  it("returns the same candidate for a serial retry", async () => {
    const { rows, service } = setup();
    const input = {
      userId: "user-1",
      context: context("serial-retry"),
      candidateType: "career_plan" as const,
      artifact: artifact(),
    };

    const first = await service.createCandidate(input);
    const retry = await service.createCandidate(input);

    expect(retry).toEqual(first);
    expect(rows).toHaveLength(1);
  });

  it("atomically returns one candidate for concurrent identical requests", async () => {
    const { rows, service } = setup();
    const input = {
      userId: "user-1",
      context: context("concurrent-retry"),
      candidateType: "career_plan" as const,
      artifact: artifact(),
    };

    const results = await Promise.all([
      service.createCandidate(input),
      service.createCandidate(input),
    ]);

    expect(results[0]).toEqual(results[1]);
    expect(rows).toHaveLength(1);
  });

  it("treats the same local idempotency key in different sessions as distinct candidates", async () => {
    const { rows, service } = setup();
    const shared = {
      userId: "user-1",
      candidateType: "career_plan" as const,
      artifact: artifact(),
    };

    const first = await service.createCandidate({
      ...shared,
      context: { ...context("local-request-1"), sessionId: "session-a" },
    });
    const second = await service.createCandidate({
      ...shared,
      context: { ...context("local-request-1"), sessionId: "session-b" },
    });

    expect(second.id).not.toBe(first.id);
    expect(rows).toHaveLength(2);
  });

  it("rejects reusing a key for a different artifact", async () => {
    const { service } = setup();
    await service.createCandidate({
      userId: "user-1",
      context: context("conflicting-retry"),
      candidateType: "career_plan",
      artifact: artifact(),
    });

    await expect(service.createCandidate({
      userId: "user-1",
      context: context("conflicting-retry"),
      candidateType: "career_plan",
      artifact: artifact({ summary: "同一个幂等键下的另一份内容" }),
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
  });

  it("rejects reusing a key for a different candidate type", async () => {
    const { service } = setup();
    await service.createCandidate({
      userId: "user-1",
      context: context("type-conflict"),
      candidateType: "career_plan",
      artifact: artifact(),
    });

    await expect(service.createCandidate({
      userId: "user-1",
      context: context("type-conflict"),
      candidateType: "learning_route",
      artifact: artifact({ taskType: "learning_route" }),
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
  });

  const compatiblePairs = [
    ["profile_patch", "profile_assessment"],
    ["profile_assessment", "profile_assessment"],
    ["ability_evidence", "simulation_report"],
    ["ability_evidence", "resume_review"],
    ["career_plan", "career_plan"],
    ["learning_route", "learning_route"],
    ["growth_replan", "growth_review"],
    ["memory_item", "memory_item"],
    ["career_template_draft", "career_exploration"],
    ["career_template_draft", "career_template_draft"],
  ] as const;

  it.each(compatiblePairs)("allows %s from %s artifacts", async (candidateType, taskType) => {
    const { service } = setup();
    const needsVersion = !["memory_item", "career_template_draft"].includes(candidateType);
    const baseVersion = needsVersion ? 3 : null;

    await expect(service.createCandidate({
      userId: "user-1",
      context: context(`${candidateType}-${taskType}`),
      candidateType,
      artifact: artifact({ taskType: taskType as never, baseVersion, _candidateType: candidateType }),
    })).resolves.toMatchObject({ candidateType });
  });

  it.each([
    ["profile_patch", "career_plan"],
    ["career_plan", "profile_assessment"],
    ["learning_route", "growth_review"],
    ["growth_replan", "career_plan"],
    ["memory_item", "career_plan"],
    ["career_template_draft", "resume_review"],
  ] as const)("rejects incompatible %s and %s", async (candidateType, taskType) => {
    const { db, service } = setup();

    await expect(service.createCandidate({
      userId: "user-1",
      context: context(`${candidateType}-${taskType}`),
      candidateType,
      artifact: artifact({ taskType: taskType as never }),
    })).rejects.toMatchObject({ code: "TASK_TYPE_MISMATCH", status: 400 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    "profile_patch",
    "profile_assessment",
    "ability_evidence",
    "career_plan",
    "learning_route",
    "growth_replan",
  ] as const)("requires baseVersion for %s", async (candidateType) => {
    const compatibleTaskType = {
      profile_patch: "profile_assessment",
      profile_assessment: "profile_assessment",
      ability_evidence: "simulation_report",
      career_plan: "career_plan",
      learning_route: "learning_route",
      growth_replan: "growth_review",
    }[candidateType];
    const { db, service } = setup();

    await expect(service.createCandidate({
      userId: "user-1",
      context: context(`no-version-${candidateType}`),
      candidateType,
      artifact: artifact({ taskType: compatibleTaskType as never, baseVersion: null, _candidateType: candidateType }),
    })).rejects.toMatchObject({ code: "BASE_VERSION_REQUIRED", status: 400 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["memory_item", "memory_item"],
    ["career_template_draft", "career_template_draft"],
  ] as const)("allows null baseVersion for %s", async (candidateType, taskType) => {
    const { service } = setup();

    await expect(service.createCandidate({
      userId: "user-1",
      context: context(`nullable-version-${candidateType}`),
      candidateType,
      artifact: artifact({ taskType: taskType as never, baseVersion: null }),
    })).resolves.toMatchObject({ candidateType });
  });

  it("keeps a transaction failure atomic and never writes formal business data", async () => {
    const upsertError = new Error("database write failed");
    const { db, formalWrites, service } = setup({ upsertError });

    await expect(service.createCandidate({
      userId: "user-1",
      context: { sessionId: "local-session-1", idempotencyKey: "failed-request" },
      candidateType: "profile_patch",
      artifact: artifact({ taskType: "profile_assessment", _candidateType: "profile_patch" }),
    })).rejects.toBe(upsertError);

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    for (const repository of Object.values(formalWrites)) {
      for (const operation of Object.values(repository)) expect(operation).not.toHaveBeenCalled();
    }
  });
});
