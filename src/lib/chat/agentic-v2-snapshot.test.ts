import { describe, expect, it, vi } from "vitest";
import { loadAgenticV2Snapshot, type SnapshotDatabase } from "./agentic-v2-snapshot";

function makeFakeDb(overrides: Partial<SnapshotDatabase> = {}): SnapshotDatabase {
  return {
    userProfile: {
      findUnique: vi.fn().mockResolvedValue({
        id: "profile-1",
        userId: "user-1",
        targetRole: "data_analyst",
        targetRoleLabel: "数据分析师",
        weeklyAvailableHours: 8,
        learningPreference: "[]",
        experienceSummary: "",
        interestTags: "[]",
        constraints: "[]",
        abilityScores: JSON.stringify({ dataAnalysis: 62 }),
        memoryEnabled: true,
        onboardingCompleted: true,
        version: 5,
        educationStage: "本科",
        major: "计算机科学",
        introStatus: "completed",
      }),
    },
    abilityEvidence: {
      findMany: vi.fn().mockImplementation((args?: { where?: Record<string, unknown> }) => {
        const allEvidence = [
          {
            id: "ev-1",
            userId: "user-1",
            abilityKey: "dataAnalysis",
            summary: "confirmed evidence",
            sourceType: "simulation",
            sourceRef: "session-1",
            confidence: 0.85,
            status: "confirmed",
            observedAt: new Date("2026-07-20"),
          },
          {
            id: "ev-2",
            userId: "user-1",
            abilityKey: "communication",
            summary: "pending evidence",
            sourceType: "chat",
            sourceRef: null,
            confidence: 0.6,
            status: "pending",
            observedAt: new Date("2026-07-21"),
          },
        ];
        // 仅按 status 过滤（简化的假实现）
        if (args?.where?.status) {
          return Promise.resolve(allEvidence.filter((e) => e.status === args.where!.status));
        }
        return Promise.resolve(allEvidence);
      }),
    },
    careerPlan: {
      findFirst: vi.fn().mockResolvedValue({
        id: "plan-1",
        userId: "user-1",
        targetRole: "data_analyst",
        version: 3,
        status: "active",
        content: "{}",
        targetRoleLabel: "数据分析师",
        years: "[]",
        quarters: "[]",
        months: "[]",
        currentMonthIndex: 1,
        assumptions: "[]",
        riskNotes: "[]",
        generationMeta: "{}",
        activatedAt: new Date("2026-07-01"),
        parentPlanId: null,
        sourceReportId: null,
      }),
    },
    progressLog: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "log-1",
          userId: "user-1",
          eventType: "task_completed",
          title: "完成数据分析练习",
          summary: "完成了Pandas数据清洗练习",
          relatedPlanId: "plan-1",
          relatedTaskId: null,
          metadata: "{}",
          createdAt: new Date("2026-07-22"),
        },
      ]),
    },
    simulationSession: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    memoryItem: {
      findMany: vi.fn().mockImplementation((args?: { where?: Record<string, unknown> }) => {
        const allMemories = [
          {
            id: "mem-1",
            userId: "user-1",
            content: "career memory",
            source: "chat",
            sensitivity: "normal",
            status: "confirmed",
            kind: "career_fact",
            scope: "career",
            reason: "用户提到",
            expiresAt: null,
          },
          {
            id: "mem-2",
            userId: "user-1",
            content: "sensitive memory",
            source: "chat",
            sensitivity: "high",
            status: "confirmed",
            kind: "personal",
            scope: "career",
            reason: "用户提到",
            expiresAt: null,
          },
        ];
        if (args?.where?.sensitivity) {
          return Promise.resolve(allMemories.filter((m) => m.sensitivity === args.where!.sensitivity));
        }
        return Promise.resolve(allMemories);
      }),
    },
    chatConversation: {
      findFirst: vi.fn().mockResolvedValue({
        id: "conv-1",
        userId: "user-1",
        summary: "用户在准备数据分析师面试",
        contextVersion: 1,
      }),
    },
    ...overrides,
  };
}

describe("Agentic V2 快照加载器", () => {
  const input = {
    userId: "user-1",
    conversationId: "conv-1",
    interaction: { surface: "chat" as const, action: "message_submit" as const },
  };

  it("仅包含已确认的能力证据，不包含待确认证据", async () => {
    const fakeDb = makeFakeDb();
    const result = await loadAgenticV2Snapshot(input, { db: fakeDb });

    const serialized = JSON.stringify(result);
    expect(serialized).toContain("confirmed evidence");
    expect(serialized).not.toContain("pending evidence");
  });

  it("不暴露身份或认证字段", async () => {
    const fakeDb = makeFakeDb();
    const result = await loadAgenticV2Snapshot(input, { db: fakeDb });

    const serialized = JSON.stringify(result);
    for (const forbidden of ["email", "password", "passwordHash", "tokenHash", "phone", "realName"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("仅为归属用户加载模拟训练状态", async () => {
    const fakeDb = makeFakeDb({
      simulationSession: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue({
          id: "session-1",
          userId: "user-1",
          scenarioKey: "cross_role_communication",
          scenarioTitle: "跨角色沟通",
          transcript: JSON.stringify([
            { role: "assistant", content: "第一轮问题" },
          ]),
          score: null,
          feedback: "{}",
          status: "in_progress",
          turnCount: 1,
          remoteConversationId: "remote-1",
        }),
      },
    });

    const result = await loadAgenticV2Snapshot({
      ...input,
      interaction: { surface: "simulation" as const, action: "continue" as const, targetRef: "session-1" } as any,
    }, { db: fakeDb });

    expect(result.simulationState?.sessionId).toBe("session-1");
    expect(fakeDb.simulationSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "session-1", userId: "user-1" } }),
    );
  });

  it("序列化后 business_data 不超过 49152 字节", async () => {
    const fakeDb = makeFakeDb();
    const result = await loadAgenticV2Snapshot(input, { db: fakeDb });
    const size = Buffer.byteLength(JSON.stringify(result), "utf8");
    expect(size).toBeLessThanOrEqual(49_152);
  });

  it("仅包含 scope=career 且 sensitivity=normal 的已确认记忆", async () => {
    const allMemories = [
      {
        id: "mem-1",
        userId: "user-1",
        content: "career memory",
        source: "chat",
        sensitivity: "normal",
        status: "confirmed",
        kind: "career_fact",
        scope: "career",
        reason: "用户提到",
        expiresAt: null,
      },
      {
        id: "mem-2",
        userId: "user-1",
        content: "sensitive memory",
        source: "chat",
        sensitivity: "high",
        status: "confirmed",
        kind: "personal",
        scope: "career",
        reason: "用户提到",
        expiresAt: null,
      },
    ];
    const fakeDb = makeFakeDb({
      memoryItem: {
        findMany: vi.fn().mockImplementation((args?: { where?: Record<string, unknown> }) => {
          if (args?.where?.sensitivity) {
            return Promise.resolve(allMemories.filter((m) => m.sensitivity === args.where!.sensitivity));
          }
          return Promise.resolve(allMemories);
        }),
      },
    });

    const result = await loadAgenticV2Snapshot(input, { db: fakeDb });
    const serialized = JSON.stringify(result);
    expect(serialized).toContain("career memory");
    expect(serialized).not.toContain("sensitive memory");
  });

  it("memoryEnabled 为 false 时不加载记忆", async () => {
    const fakeDb = makeFakeDb({
      userProfile: {
        findUnique: vi.fn().mockResolvedValue({
          id: "profile-1",
          userId: "user-1",
          targetRole: "data_analyst",
          targetRoleLabel: null,
          weeklyAvailableHours: 8,
          learningPreference: "[]",
          experienceSummary: "",
          interestTags: "[]",
          constraints: "[]",
          abilityScores: "{}",
          memoryEnabled: false,
          onboardingCompleted: true,
          version: 5,
          educationStage: null,
          major: null,
          introStatus: "completed",
        }),
      },
    });

    await loadAgenticV2Snapshot(input, { db: fakeDb });
    // 不应该查询记忆
    expect(fakeDb.memoryItem.findMany).not.toHaveBeenCalled();
  });

  it("仅加载活动计划，不加载历史计划", async () => {
    const fakeDb = makeFakeDb();
    const loadedResult = await loadAgenticV2Snapshot(input, { db: fakeDb });

    expect(fakeDb.careerPlan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", status: "active" },
        orderBy: { version: "desc" },
      }),
    );
    const serialized = JSON.stringify(loadedResult);
    expect(serialized).toContain("plan-1");
  });
});
