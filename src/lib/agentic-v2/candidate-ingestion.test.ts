import { describe, expect, it, vi } from "vitest";
import { ingestAgentArtifact, type IngestAgentArtifactInput } from "./candidate-ingestion";
import type { AgentArtifactCandidateService, CreateAgentArtifactCandidateInput } from "./candidate-service";

const baseInput: IngestAgentArtifactInput = {
  userId: "user-1",
  conversationId: "conv-1",
  sessionId: "session-1",
  clientRequestId: "req-1",
};

function makeCandidateService(overrides: Partial<AgentArtifactCandidateService> = {}): AgentArtifactCandidateService {
  return {
    createCandidate: vi.fn().mockResolvedValue({
      id: "cand-1",
      status: "pending",
      candidateType: "career_plan",
    }),
    ...overrides,
  };
}

const pendingConfirmationArtifact = {
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

describe("候选摄入", () => {
  it("success / needs_input / error 状态的 artifact 不创建候选", async () => {
    const candidateService = makeCandidateService();
    for (const status of ["success", "needs_input", "error"] as const) {
      const result = await ingestAgentArtifact(
        { ...baseInput, artifact: { ...pendingConfirmationArtifact, status } },
        candidateService,
      );
      expect(result.candidate).toBeUndefined();
    }
    expect(candidateService.createCandidate).not.toHaveBeenCalled();
  });

  it("pending_confirmation 但 requiresUserConfirmation=false 不创建候选", async () => {
    const candidateService = makeCandidateService();
    const result = await ingestAgentArtifact(
      {
        ...baseInput,
        artifact: { ...pendingConfirmationArtifact, requiresUserConfirmation: false },
      },
      candidateService,
    );
    expect(result.candidate).toBeUndefined();
    expect(candidateService.createCandidate).not.toHaveBeenCalled();
  });

  it("有效的 pending_confirmation artifact 调用 candidateService.createCandidate 一次", async () => {
    const candidateService = makeCandidateService();
    const result = await ingestAgentArtifact(
      { ...baseInput, artifact: pendingConfirmationArtifact },
      candidateService,
    );
    expect(result.candidate).toBeDefined();
    expect(result.candidate?.candidateType).toBe("career_plan");
    expect(candidateService.createCandidate).toHaveBeenCalledOnce();
    expect(candidateService.createCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        candidateType: "career_plan",
        context: expect.objectContaining({
          sessionId: "session-1",
          idempotencyKey: "req-1",
        }),
      }),
    );
  });

  it("simulation_turn 从不创建候选", async () => {
    const candidateService = makeCandidateService();
    const result = await ingestAgentArtifact(
      {
        ...baseInput,
        artifact: {
          ...pendingConfirmationArtifact,
          taskType: "simulation_turn",
          status: "pending_confirmation",
          requiresUserConfirmation: true,
        },
      },
      candidateService,
    );
    expect(result.candidate).toBeUndefined();
    expect(candidateService.createCandidate).not.toHaveBeenCalled();
  });

  it("无 artifact 时不创建候选", async () => {
    const candidateService = makeCandidateService();
    const result = await ingestAgentArtifact(
      { ...baseInput, artifact: undefined },
      candidateService,
    );
    expect(result.candidate).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });

  it("candidateService 校验错误产生警告但不失败", async () => {
    const candidateService = makeCandidateService({
      createCandidate: vi.fn().mockRejectedValue(new Error("VALIDATION_ERROR")),
    });
    const result = await ingestAgentArtifact(
      { ...baseInput, artifact: pendingConfirmationArtifact },
      candidateService,
    );
    expect(result.candidate).toBeUndefined();
    expect(result.warnings).toContain("CANDIDATE_INGESTION_FAILED");
  });
});
