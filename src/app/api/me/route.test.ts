import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findLogs: vi.fn(),
  findRole: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/env", () => ({ getTboxConfig: () => ({ mode: "manual" }) }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    progressLog: { findMany: mocks.findLogs },
    roleTemplate: { findUnique: mocks.findRole },
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
        aiRuntime: { requestedMode: "manual" },
      },
    });
    expect(payload.data.match.score).not.toBe(arithmeticAverage);
    expect(mocks.findLogs).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, eventType: true, title: true, summary: true, createdAt: true },
    });
  });
});
