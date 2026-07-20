import { describe, expect, it, vi } from "vitest";
import type { AgentArtifactV1 } from "./contracts";
import {
  AGENT_ARTIFACT_CANDIDATE_TYPES,
  AgentArtifactCandidateError,
  createAgentArtifactCandidateService,
} from "./candidate-service";

function artifact(overrides: Partial<AgentArtifactV1> = {}): AgentArtifactV1 {
  return {
    schemaVersion: "1.0",
    taskType: "career_plan",
    status: "pending_confirmation",
    summary: "一份等待用户确认的职业计划候选",
    data: { stages: [] },
    evidence: [],
    sources: [],
    assumptions: [],
    warnings: [],
    requiresUserConfirmation: true,
    baseVersion: 5,
    nextActions: [],
    ...overrides,
  };
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
        where: { userId_idempotencyKey: { userId: string; idempotencyKey: string } };
        create: Omit<StoredCandidate, "id">;
      }) => {
        if (options.upsertError) throw options.upsertError;
        const identity = `${args.where.userId_idempotencyKey.userId}:${args.where.userId_idempotencyKey.idempotencyKey}`;
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
    ["an artifact that bypasses confirmation", { requiresUserConfirmation: false }, "CONFIRMATION_REQUIRED"],
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
      where: { userId_idempotencyKey: { userId: "user-1", idempotencyKey: "request-persist" } },
      create: {
        userId: "user-1",
        idempotencyKey: "request-persist",
        candidateType: "career_plan",
        status: "pending",
        artifact: JSON.stringify(inputArtifact),
        baseVersion: 7,
        sourceConversationId: "conversation-1",
      },
      update: {},
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
    ["ability_evidence", "profile_assessment"],
    ["ability_evidence", "simulation_report"],
    ["ability_evidence", "resume_review"],
    ["ability_evidence", "growth_review"],
    ["career_plan", "career_plan"],
    ["learning_route", "learning_route"],
    ["growth_replan", "growth_review"],
    ["memory_item", "memory_item"],
    ["career_template_draft", "career_exploration"],
    ["career_template_draft", "career_template_draft"],
  ] as const;

  it.each(compatiblePairs)("allows %s from %s artifacts", async (candidateType, taskType) => {
    const { service } = setup();
    const baseVersion = ["memory_item", "career_template_draft"].includes(candidateType) ? null : 3;

    await expect(service.createCandidate({
      userId: "user-1",
      context: context(`${candidateType}-${taskType}`),
      candidateType,
      artifact: artifact({ taskType: taskType as never, baseVersion }),
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
    "ability_evidence",
    "career_plan",
    "learning_route",
    "growth_replan",
  ] as const)("requires baseVersion for %s", async (candidateType) => {
    const compatibleTaskType = {
      profile_patch: "profile_assessment",
      ability_evidence: "profile_assessment",
      career_plan: "career_plan",
      learning_route: "learning_route",
      growth_replan: "growth_review",
    }[candidateType];
    const { db, service } = setup();

    await expect(service.createCandidate({
      userId: "user-1",
      context: context(`no-version-${candidateType}`),
      candidateType,
      artifact: artifact({ taskType: compatibleTaskType as never, baseVersion: null }),
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
      artifact: artifact({ taskType: "profile_assessment" }),
    })).rejects.toBe(upsertError);

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    for (const repository of Object.values(formalWrites)) {
      for (const operation of Object.values(repository)) expect(operation).not.toHaveBeenCalled();
    }
  });
});
