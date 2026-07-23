import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  getPrismaFindFirst: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    agentArtifactCandidate: {
      findFirst: mocks.getPrismaFindFirst,
    },
  }),
}));

// 动态导入才能让 mock 生效
const { GET } = await import("./route");

describe("GET /api/agentic-v2/candidates/[candidateId]", () => {
  it("返回属于该用户的候选详情", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "u1" });
    mocks.getPrismaFindFirst.mockResolvedValue({
      id: "c1",
      userId: "u1",
      candidateType: "career_plan",
      status: "pending",
      artifact: JSON.stringify({
        schemaVersion: "1.0",
        taskType: "career_plan",
        status: "pending_confirmation",
        summary: "计划候选",
        data: { targetRole: "data_analyst", phases: [] },
        evidence: [],
        sources: [],
        assumptions: [],
        warnings: [],
        requiresUserConfirmation: true,
        baseVersion: 3,
        nextActions: [],
      }),
      baseVersion: 3,
      sourceSessionId: "session-1",
      sourceConversationId: "conv-1",
      createdAt: new Date(),
    });

    const response = await GET(
      new Request("http://localhost/api/agentic-v2/candidates/c1"),
      { params: Promise.resolve({ candidateId: "c1" }) },
    );
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe("c1");
  });

  it("其他用户收到 404", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "u1" });
    mocks.getPrismaFindFirst.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/agentic-v2/candidates/c2"),
      { params: Promise.resolve({ candidateId: "c2" }) },
    );
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("CANDIDATE_NOT_FOUND");
    expect(response.status).toBe(404);
  });
});
