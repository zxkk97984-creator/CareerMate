import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  conversationFindUnique: vi.fn(),
  conversationUpdate: vi.fn(),
  conversationUpdateMany: vi.fn(),
  logCreate: vi.fn(),
  profileFindUnique: vi.fn(),
  profileUpdate: vi.fn(),
  profileUpdateMany: vi.fn().mockResolvedValue({ count: 1 }),
  requireCurrentUser: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/dto", () => ({ profileDto: (profile: unknown) => profile }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    onboardingConversation: { findUnique: mocks.conversationFindUnique },
    userProfile: { findUnique: mocks.profileFindUnique },
    $transaction: mocks.transaction,
  }),
}));

import { POST } from "./route";

const profile = {
  id: "profile-1",
  userId: "user-1",
  educationStage: "junior",
  major: "",
  targetRole: "ai_product_manager",
  targetRoleLabel: "AI 产品经理",
  weeklyAvailableHours: 5,
  learningPreference: "[]",
  experienceSummary: "",
  interestTags: "[]",
  constraints: "[]",
  abilityScores: "{}",
  memoryEnabled: true,
  onboardingCompleted: false,
  version: 1,
  introStatus: "not_started",
  updatedAt: new Date("2026-07-10T00:00:00.000Z"),
};

const completeDraft = {
  educationStage: "junior",
  major: "统计学",
  targetRole: "data_analyst",
  targetRoleLabel: "数据分析师",
  weeklyAvailableHours: 8,
  learningPreference: ["project"],
  experienceSummary: "做过课程数据项目",
  constraints: ["暂无特殊限制"],
};

function request(body: unknown) {
  return new Request("http://localhost/api/onboarding/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue({ id: "user-1", profile });
  mocks.profileFindUnique.mockResolvedValue(profile);
  mocks.conversationFindUnique.mockResolvedValue({
    id: "conversation-1",
    userId: "user-1",
    status: "active",
    completeness: 1,
    draft: JSON.stringify(completeDraft),
  });
  mocks.profileUpdate.mockResolvedValue({
    ...profile,
    ...completeDraft,
    learningPreference: JSON.stringify(completeDraft.learningPreference),
    constraints: JSON.stringify(completeDraft.constraints),
    onboardingCompleted: true,
  });
  mocks.transaction.mockImplementation(async (callback) => callback({
    userProfile: { update: mocks.profileUpdate, updateMany: mocks.profileUpdateMany, findUnique: mocks.profileFindUnique },
    onboardingConversation: {
      update: mocks.conversationUpdate,
      updateMany: mocks.conversationUpdateMany,
    },
    progressLog: { create: mocks.logCreate },
  }));
  mocks.conversationUpdateMany.mockResolvedValue({ count: 1 });
});

describe("POST /api/onboarding/complete", () => {
  it("requires ownership and an existing conversation", async () => {
    mocks.conversationFindUnique.mockResolvedValueOnce(null);
    expect((await POST(request({ conversationId: "missing" }))).status).toBe(404);

    mocks.conversationFindUnique.mockResolvedValueOnce({ id: "foreign", userId: "user-2", status: "active" });
    expect((await POST(request({ conversationId: "foreign" }))).status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a server draft below the 80 percent threshold", async () => {
    mocks.conversationFindUnique.mockResolvedValue({
      id: "conversation-1",
      userId: "user-1",
      status: "active",
      completeness: 0.79,
      draft: JSON.stringify(completeDraft),
    });

    const response = await POST(request({ conversationId: "conversation-1" }));

    expect(response.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("validates the stored draft and ignores a client-supplied draft", async () => {
    mocks.conversationFindUnique.mockResolvedValueOnce({
      id: "conversation-1",
      userId: "user-1",
      status: "active",
      completeness: 1,
      draft: JSON.stringify({ ...completeDraft, weeklyAvailableHours: 99 }),
    });
    expect((await POST(request({ conversationId: "conversation-1", draft: completeDraft }))).status).toBe(409);

    mocks.conversationFindUnique.mockResolvedValueOnce({
      id: "conversation-1",
      userId: "user-1",
      status: "active",
      completeness: 1,
      draft: JSON.stringify(completeDraft),
    });
    await POST(request({ conversationId: "conversation-1", draft: { targetRole: "aigc_operator" } }));

    // 验证使用了存储的草稿（data_analyst）而非客户端传入的（aigc_operator）
    expect(mocks.profileUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1" },
      data: expect.objectContaining({ targetRole: "data_analyst" }),
    }));
  });

  it("transactionally updates the profile, completes the conversation, and creates one progress log", async () => {
    const response = await POST(request({ conversationId: "conversation-1" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, data: { profile: { onboardingCompleted: true }, alreadyCompleted: false } });
    // mutateUserProfile 通过 update 写入画像字段 + 版本递增
    expect(mocks.profileUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1" },
      data: expect.objectContaining({
        educationStage: "junior",
        major: "统计学",
        targetRole: "data_analyst",
        targetRoleLabel: "数据分析师",
        weeklyAvailableHours: 8,
        version: { increment: 1 },
      }),
    }));
    // 单独设置 onboardingCompleted
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { onboardingCompleted: true },
    });
    expect(mocks.conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: "conversation-1", userId: "user-1", status: "active" },
      data: { status: "completed" },
    });
    expect(mocks.logCreate).toHaveBeenCalledTimes(1);
  });

  it("returns idempotent success for an already completed conversation without another log", async () => {
    mocks.conversationFindUnique.mockResolvedValue({
      id: "conversation-1",
      userId: "user-1",
      status: "completed",
      completeness: 1,
      draft: JSON.stringify(completeDraft),
    });
    const completedProfile = { ...profile, onboardingCompleted: true };
    mocks.profileFindUnique.mockResolvedValue(completedProfile);

    const response = await POST(request({ conversationId: "conversation-1" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      data: {
        profile: { ...completedProfile, updatedAt: "2026-07-10T00:00:00.000Z" },
        alreadyCompleted: true,
      },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logCreate).not.toHaveBeenCalled();
  });

  it("atomically claims an active conversation so concurrent completion creates one log", async () => {
    let claimed = false;
    mocks.conversationUpdateMany.mockImplementation(async () => {
      if (claimed) return { count: 0 };
      claimed = true;
      return { count: 1 };
    });
    mocks.transaction.mockImplementation(async (callback) => callback({
      userProfile: {
        update: mocks.profileUpdate,
        findUnique: mocks.profileFindUnique,
      },
      onboardingConversation: {
        update: mocks.conversationUpdate,
        updateMany: mocks.conversationUpdateMany,
      },
      progressLog: { create: mocks.logCreate },
    }));
    mocks.profileFindUnique.mockResolvedValue({ ...profile, onboardingCompleted: true });

    const responses = await Promise.all([
      POST(request({ conversationId: "conversation-1" })),
      POST(request({ conversationId: "conversation-1" })),
    ]);
    const payloads = await Promise.all(responses.map((response) => response.json()));

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(payloads.map((payload) => payload.data.alreadyCompleted).sort()).toEqual([false, true]);
    expect(mocks.conversationUpdateMany).toHaveBeenCalledTimes(2);
    expect(mocks.logCreate).toHaveBeenCalledTimes(1);
  });
});
