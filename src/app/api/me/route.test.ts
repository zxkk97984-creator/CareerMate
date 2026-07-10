import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findLogs: vi.fn(),
  findOnboardingConversation: vi.fn(),
  findRole: vi.fn(),
  getCurrentUser: vi.fn(),
  upsertProfile: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/env", () => ({ getTboxConfig: () => ({ mode: "manual" }) }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    onboardingConversation: { findFirst: mocks.findOnboardingConversation },
    progressLog: { findMany: mocks.findLogs },
    roleTemplate: { findUnique: mocks.findRole },
    userProfile: { upsert: mocks.upsertProfile },
  }),
}));

import { GET } from "./route";

const profile = {
  id: "profile-1",
  userId: "user-1",
  educationStage: "junior",
  major: "统计学",
  targetRole: "data_analyst",
  targetRoleLabel: "数据分析师",
  weeklyAvailableHours: 8,
  learningPreference: "[]",
  experienceSummary: "课程项目",
  interestTags: "[]",
  constraints: "[]",
  abilityScores: JSON.stringify({
    aiTooling: 100,
    roleFoundation: 0,
    dataAnalysis: 0,
    businessProduct: 0,
    communication: 0,
    projectPractice: 0,
  }),
  memoryEnabled: true,
  onboardingCompleted: true,
  updatedAt: new Date("2026-07-10T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({
    id: "user-1",
    username: "student",
    displayName: "学生",
    role: "user",
    profile,
  });
  mocks.findRole.mockResolvedValue({
    abilityWeights: JSON.stringify({
      aiTooling: 0.5,
      roleFoundation: 0.1,
      dataAnalysis: 0.1,
      businessProduct: 0.1,
      communication: 0.1,
      projectPractice: 0.1,
    }),
  });
  mocks.findLogs.mockResolvedValue([
    {
      id: "log-1",
      eventType: "onboarding_completed",
      title: "完成职业画像引导",
      summary: "画像已确认",
      createdAt: new Date("2026-07-10T01:00:00.000Z"),
    },
  ]);
  mocks.findOnboardingConversation.mockResolvedValue({
    id: "conversation-1",
    status: "active",
    requestedMode: "manual",
    actualMode: "mock",
    draft: JSON.stringify({ educationStage: "junior", major: "统计学" }),
    completeness: 2 / 7,
    transcript: JSON.stringify([
      {
        role: "assistant",
        content: "继续补充信息",
        meta: {
          requestedMode: "manual",
          actualMode: "mock",
          degraded: true,
          fallbackReason: "network_error",
          source: "local-mock",
        },
      },
    ]),
  });
});

describe("GET /api/me", () => {
  it("returns weighted match data, recent growth logs, and requested runtime mode", async () => {
    const response = await GET();
    const payload = await response.json();
    const arithmeticAverage = Math.round(100 / 6);

    expect(payload).toMatchObject({
      ok: true,
      data: {
        profile: { onboardingCompleted: true },
        match: {
          score: 50,
          explanation: expect.stringContaining("数据分析师"),
          weakAbilities: expect.any(Array),
        },
        recentProgressLogs: [
          {
            id: "log-1",
            eventType: "onboarding_completed",
            title: "完成职业画像引导",
            summary: "画像已确认",
            createdAt: "2026-07-10T01:00:00.000Z",
          },
        ],
        aiRuntime: {
          requestedMode: "manual",
          actualMode: "mock",
          degraded: true,
          fallbackReason: "network_error",
          source: "local-mock",
        },
        activeOnboardingConversation: {
          id: "conversation-1",
          status: "active",
          transcript: [{ role: "assistant", content: "继续补充信息" }],
          draft: { educationStage: "junior", major: "统计学" },
          completeness: 2 / 7,
          executionMeta: {
            requestedMode: "manual",
            actualMode: "mock",
            degraded: true,
            fallbackReason: "network_error",
            source: "local-mock",
          },
        },
      },
    });
    expect(payload.data.match.score).not.toBe(arithmeticAverage);
    expect(mocks.findLogs).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, eventType: true, title: true, summary: true, createdAt: true },
    });
    expect(mocks.findOnboardingConversation).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "active" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        status: true,
        transcript: true,
        draft: true,
        completeness: true,
        requestedMode: true,
        actualMode: true,
      },
    });
    expect(mocks.upsertProfile).not.toHaveBeenCalled();
  });

  it("defaults actual mode to the requested runtime mode when no execution was persisted", async () => {
    mocks.findOnboardingConversation.mockResolvedValue(null);

    const payload = await (await GET()).json();

    expect(payload.data.aiRuntime).toEqual({
      requestedMode: "manual",
      actualMode: "manual",
      degraded: false,
      fallbackReason: null,
      source: "configured-no-execution",
    });
    expect(payload.data.activeOnboardingConversation).toBeNull();
  });

  it("safely falls back when the active conversation stores malformed JSON", async () => {
    mocks.findOnboardingConversation.mockResolvedValue({
      id: "conversation-broken",
      status: "active",
      requestedMode: "manual",
      actualMode: "manual",
      transcript: "{broken",
      draft: JSON.stringify({ weeklyAvailableHours: 99 }),
      completeness: 0.95,
    });

    const payload = await (await GET()).json();

    expect(payload.data.activeOnboardingConversation).toEqual({
      id: "conversation-broken",
      status: "active",
      transcript: [],
      draft: {},
      completeness: 0,
      executionMeta: {
        requestedMode: "manual",
        actualMode: "manual",
        degraded: false,
        fallbackReason: null,
        source: "configured-no-execution",
      },
    });
  });

  it("repairs a missing profile once so onboarding can render an incomplete ProfileDto", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "user-without-profile",
      username: "legacy",
      displayName: "待引导用户",
      role: "user",
      profile: null,
    });
    const repairedProfile = {
      ...profile,
      id: "profile-repaired",
      userId: "user-without-profile",
      targetRole: "ai_product_manager",
      targetRoleLabel: "AI 产品经理",
      onboardingCompleted: false,
    };
    mocks.upsertProfile.mockResolvedValue(repairedProfile);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.profile).toMatchObject({
      userId: "user-without-profile",
      onboardingCompleted: false,
      targetRole: "ai_product_manager",
    });
    expect(mocks.upsertProfile).toHaveBeenCalledWith({
      where: { userId: "user-without-profile" },
      update: {},
      create: expect.objectContaining({
        userId: "user-without-profile",
        onboardingCompleted: false,
        targetRole: "ai_product_manager",
      }),
    });
  });
});
