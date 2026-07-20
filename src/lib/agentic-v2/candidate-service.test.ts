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

function setup(options: { conversationOwnerId?: string | null; createError?: Error } = {}) {
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
      create: options.createError
        ? vi.fn().mockRejectedValue(options.createError)
        : vi.fn().mockImplementation(async ({ data }: { data: { candidateType: string } }) => ({
            id: "candidate-1",
            status: "pending",
            candidateType: data.candidateType,
          })),
    },
    ...formalWrites,
  };
  const db = {
    $transaction: vi.fn(async (callback: (client: typeof transaction) => unknown) => callback(transaction)),
    ...formalWrites,
  };
  const service = createAgentArtifactCandidateService({ db: db as never });
  return { db, service, transaction, formalWrites };
}

const context = {
  sessionId: "local-session-1",
  conversationId: "conversation-1",
};

describe("AgentArtifactCandidateService", () => {
  it("accepts every planned candidate type", async () => {
    for (const candidateType of AGENT_ARTIFACT_CANDIDATE_TYPES) {
      const { service } = setup();

      await expect(service.createCandidate({
        userId: "user-1",
        context,
        candidateType,
        artifact: artifact(),
      })).resolves.toMatchObject({ candidateType });
    }
  });

  it("rejects candidate types outside the V2 allowlist before opening a transaction", async () => {
    const { db, service } = setup();

    await expect(service.createCandidate({
      userId: "user-1",
      context,
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
      context,
      candidateType: "career_plan",
      artifact: artifact(overrides),
    })).rejects.toMatchObject({ code: expectedCode, status: 400 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("validates the artifact with the shared AgentArtifactV1 schema", async () => {
    const { db, service } = setup();

    await expect(service.createCandidate({
      userId: "user-1",
      context,
      candidateType: "career_plan",
      artifact: { ...artifact(), schemaVersion: "2.0" },
    })).rejects.toBeInstanceOf(AgentArtifactCandidateError);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a source conversation that does not belong to the user", async () => {
    const { service, transaction } = setup({ conversationOwnerId: null });

    await expect(service.createCandidate({
      userId: "user-1",
      context,
      candidateType: "career_plan",
      artifact: artifact(),
    })).rejects.toMatchObject({ code: "CONVERSATION_NOT_FOUND", status: 404 });
    expect(transaction.chatConversation.findFirst).toHaveBeenCalledWith({
      where: { id: "conversation-1", userId: "user-1" },
      select: { id: true },
    });
    expect(transaction.agentArtifactCandidate.create).not.toHaveBeenCalled();
  });

  it("persists the validated artifact and source context without promoting it", async () => {
    const { db, formalWrites, service, transaction } = setup();
    const inputArtifact = artifact({ baseVersion: 7 });

    const result = await service.createCandidate({
      userId: "user-1",
      context,
      candidateType: "career_plan",
      artifact: inputArtifact,
    });

    expect(result).toEqual({
      id: "candidate-1",
      status: "pending",
      candidateType: "career_plan",
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.agentArtifactCandidate.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        candidateType: "career_plan",
        status: "pending",
        artifact: JSON.stringify(inputArtifact),
        baseVersion: 7,
        sourceSessionId: "local-session-1",
        sourceConversationId: "conversation-1",
      },
      select: { id: true, status: true, candidateType: true },
    });
    for (const repository of Object.values(formalWrites)) {
      for (const operation of Object.values(repository)) {
        expect(operation).not.toHaveBeenCalled();
      }
    }
  });

  it("keeps the failure atomic and never writes formal business data", async () => {
    const createError = new Error("database write failed");
    const { db, formalWrites, service } = setup({ createError });

    await expect(service.createCandidate({
      userId: "user-1",
      context: { sessionId: "local-session-1" },
      candidateType: "profile_patch",
      artifact: artifact({ taskType: "profile_assessment" }),
    })).rejects.toBe(createError);

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    for (const repository of Object.values(formalWrites)) {
      for (const operation of Object.values(repository)) {
        expect(operation).not.toHaveBeenCalled();
      }
    }
  });
});
