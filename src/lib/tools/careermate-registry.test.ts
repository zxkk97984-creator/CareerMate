import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profileFind: vi.fn(),
  conversationFind: vi.fn(),
  candidateCreate: vi.fn(),
  evidenceCreate: vi.fn(),
}));

const transaction = {
  userProfile: { findUnique: mocks.profileFind },
  chatConversation: { findFirst: mocks.conversationFind },
  profileUpdateCandidate: { create: mocks.candidateCreate },
  abilityEvidence: { create: mocks.evidenceCreate },
};

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    $transaction: (callback: (client: typeof transaction) => unknown) => callback(transaction),
  }),
}));

import { createCareerMateToolRegistry } from "./careermate-registry";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.profileFind.mockResolvedValue({
    userId: "user-1",
    major: "数字媒体技术",
    abilityScores: "{}",
  });
  mocks.conversationFind.mockResolvedValue(null);
  mocks.candidateCreate.mockResolvedValue({ id: "candidate-1", status: "pending" });
});

describe("CareerMate tool registry", () => {
  it("rejects a source conversation that does not belong to the bound user", async () => {
    const registry = createCareerMateToolRegistry();

    await expect(registry.call("profile.candidate.create", {
      field: "major",
      newValue: "统计学",
      confidence: 0.9,
      reason: "用户明确说明",
      sourceConversationId: "conversation-other-user",
    }, {
      userId: "user-1",
      sessionId: "session-1",
      scopes: ["profile:candidates"],
    })).rejects.toMatchObject({ code: "INVALID_PARAMS" });
    expect(mocks.candidateCreate).not.toHaveBeenCalled();
  });
});
