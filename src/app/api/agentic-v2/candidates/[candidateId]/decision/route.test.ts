import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  resolveCandidate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("@/lib/agentic-v2/candidate-resolution", () => ({
  resolveAgentArtifactCandidate: mocks.resolveCandidate,
  AgentArtifactCandidateResolutionError: class extends Error {
    constructor(msg: string, public code: string, public status: number) { super(msg); }
  },
}));

const { POST } = await import("./route");

describe("POST /api/agentic-v2/candidates/[candidateId]/decision", () => {
  it("接受候选", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "u1" });
    mocks.resolveCandidate.mockResolvedValue({ id: "c1", status: "accepted", candidateType: "career_plan" });

    const response = await POST(
      new Request("http://localhost/api/agentic-v2/candidates/c1/decision", {
        method: "POST",
        body: JSON.stringify({ decision: "accept" }),
      }),
      { params: Promise.resolve({ candidateId: "c1" }) },
    );
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("accepted");
  });

  it("拒绝候选", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "u1" });
    mocks.resolveCandidate.mockResolvedValue({ id: "c1", status: "rejected", candidateType: "career_plan" });

    const response = await POST(
      new Request("http://localhost/api/agentic-v2/candidates/c1/decision", {
        method: "POST",
        body: JSON.stringify({ decision: "reject" }),
      }),
      { params: Promise.resolve({ candidateId: "c1" }) },
    );
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("rejected");
  });

  it("无效决定返回 400", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "u1" });

    const response = await POST(
      new Request("http://localhost/api/agentic-v2/candidates/c1/decision", {
        method: "POST",
        body: JSON.stringify({ decision: "invalid" }),
      }),
      { params: Promise.resolve({ candidateId: "c1" }) },
    );
    expect(response.status).toBe(400);
  });
});
