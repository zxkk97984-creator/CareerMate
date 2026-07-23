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

  it("activePlan 包含实际计划摘要、近期行动或阶段信息", async () => {
    const fakeDb = makeFakeDb();
    const loadedResult = await loadAgenticV2Snapshot(input, { db: fakeDb });

    const historyData = loadedResult.historySnapshot.data as Record<string, unknown>;
    const plan = historyData.activePlan as Record<string, unknown> | null;
    expect(plan).toBeDefined();
    // 应包含内容摘要字段
    const planKeys = Object.keys(plan!);
    const hasContent = planKeys.some((k) =>
      k === "summary" || k === "immediateActions" || k === "phases" || k === "content",
    );
    expect(hasContent).toBe(true);
  });

  it("计划内容中的 immediateActions 不是数组时安全降级为空数组", async () => {
    const fakeDb = makeFakeDb({
      careerPlan: {
        findFirst: vi.fn().mockResolvedValue({
          id: "plan-1",
          userId: "user-1",
          targetRole: "data_analyst",
          version: 3,
          status: "active",
          schemaVersion: 2,
          content: JSON.stringify({
            summary: "计划摘要",
            immediateActions: { title: "错误形状" },
            phases: "错误形状",
          }),
          targetRoleLabel: "数据分析师",
          currentMonthIndex: 1,
          activatedAt: new Date("2026-07-01"),
        }),
      },
    });

    const loadedResult = await loadAgenticV2Snapshot(input, { db: fakeDb });
    const historyData = loadedResult.historySnapshot.data as Record<string, unknown>;
    const plan = historyData.activePlan as Record<string, unknown>;
    expect(plan.immediateActions).toEqual([]);
    expect(plan.phases).toEqual([]);
  });

  it("最近的 simulation transcript 取最后 N 条而非前 N 条", async () => {
    // 构造含 20 条 transcript 的模拟会话
    const longTranscript = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `第${i + 1}条消息`,
    }));
    const fakeDb = makeFakeDb({
      simulationSession: {
        findMany: vi.fn().mockResolvedValue([{
          id: "sim-1",
          userId: "user-1",
          scenarioKey: "cross_role_communication",
          scenarioTitle: "跨岗位沟通",
          transcript: JSON.stringify(longTranscript),
          score: 80,
          turnCount: 10,
          status: "completed",
          updatedAt: new Date("2026-07-22"),
        }]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });

    const loadedResult = await loadAgenticV2Snapshot(input, { db: fakeDb });
    const historyData = loadedResult.historySnapshot.data as Record<string, unknown>;
    const sims = historyData.recentSimulations as Array<Record<string, unknown>>;
    expect(sims.length).toBe(1);
    const transcript = sims[0].transcript as Array<{ content: string }>;
    // 应取最后 12 条，包含第 20 条消息
    expect(transcript.length).toBe(12);
    expect(transcript[transcript.length - 1].content).toBe("第20条消息");
  });

  it("字节裁剪后返回最终裁剪对象而非旧对象", async () => {
    // 构造超大数据触发字节裁剪：每条 evidence summary 4000 字符，20 条 ≈ 80KB+，远超 49152
    const bigText = "ABCDEFGHIJ".repeat(400); // 4000 chars
    const bigEvidence = Array.from({ length: 20 }, (_, i) => ({
      id: `ev-${i}`,
      userId: "user-1",
      abilityKey: `skill${i}`,
      summary: bigText,
      sourceType: "simulation",
      sourceRef: `session-${i}`,
      confidence: 0.8,
      status: "confirmed",
      observedAt: new Date("2026-07-20"),
    }));
    const bigProgress = Array.from({ length: 20 }, (_, i) => ({
      id: `log-${i}`,
      userId: "user-1",
      eventType: "task_completed",
      title: `超大进度标题 ${i} `.repeat(30),
      summary: `超大进度摘要 ${i} `.repeat(50),
      relatedPlanId: "plan-1",
      relatedTaskId: null,
      metadata: "{}",
      createdAt: new Date("2026-07-22"),
    }));

    const fakeDb = makeFakeDb({
      abilityEvidence: {
        findMany: vi.fn().mockImplementation((args?: { where?: Record<string, unknown> }) => {
          if (args?.where?.status === "confirmed") return Promise.resolve(bigEvidence);
          return Promise.resolve(bigEvidence);
        }),
      },
      progressLog: {
        findMany: vi.fn().mockResolvedValue(bigProgress),
      },
    });

    const loadedResult = await loadAgenticV2Snapshot(input, { db: fakeDb });
    const resultBytes = Buffer.byteLength(JSON.stringify(loadedResult), "utf8");

    // 返回对象的实际字节数必须在限制内
    expect(resultBytes).toBeLessThanOrEqual(49_152);

    // 验证 profileData 中的 evidence 已被裁剪
    const pd = loadedResult.profileSnapshot.data as Record<string, unknown>;
    const ev = (pd.abilityEvidence ?? []) as unknown[];
    // 裁剪后不应超过 10 条（可能更少如果还触发后续裁剪）
    expect(ev.length).toBeLessThanOrEqual(10);
  });

  it("字节裁剪时保留数据库返回顺序中最新的进度和证据", async () => {
    const large = "进度内容".repeat(400);
    const progressRows = Array.from({ length: 20 }, (_, index) => ({
      id: `log-${index}`,
      userId: "user-1",
      eventType: `newest-${index}`,
      title: large,
      summary: large,
      createdAt: new Date(Date.UTC(2026, 6, 23, 0, 0, 20 - index)),
    }));
    const evidenceRows = Array.from({ length: 20 }, (_, index) => ({
      id: `ev-${index}`,
      userId: "user-1",
      abilityKey: `newest-${index}`,
      summary: large,
      sourceType: "progress",
      sourceRef: null,
      confidence: 0.8,
      status: "confirmed",
      observedAt: new Date(Date.UTC(2026, 6, 23, 0, 0, 20 - index)),
    }));
    const fakeDb = makeFakeDb({
      progressLog: {
        findMany: vi.fn().mockResolvedValue(progressRows),
      },
      abilityEvidence: {
        findMany: vi.fn().mockResolvedValue(evidenceRows),
      },
    });

    const loadedResult = await loadAgenticV2Snapshot(input, { db: fakeDb });
    const historyData = loadedResult.historySnapshot.data as Record<string, unknown>;
    const progress = historyData.recentProgress as Array<{ eventType: string }>;
    const profileData = loadedResult.profileSnapshot.data as Record<string, unknown>;
    const evidence = profileData.abilityEvidence as Array<{ abilityKey: string }>;

    expect(progress.some((item) => item.eventType === "newest-0")).toBe(true);
    expect(evidence.some((item) => item.abilityKey === "newest-0")).toBe(true);
  });

  it("单条超长模拟转录也会被裁剪到 business_data 字节预算内", async () => {
    const hugeTranscript = [
      { role: "assistant", content: "问题".repeat(40_000) },
    ];
    const fakeDb = makeFakeDb({
      simulationSession: {
        findMany: vi.fn().mockResolvedValue([{
          id: "sim-1",
          userId: "user-1",
          scenarioKey: "cross_role_communication",
          scenarioTitle: "跨岗位沟通",
          transcript: JSON.stringify(hugeTranscript),
          score: 80,
          turnCount: 1,
          status: "completed",
          updatedAt: new Date("2026-07-22"),
        }]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });

    const loadedResult = await loadAgenticV2Snapshot(input, { db: fakeDb });
    expect(Buffer.byteLength(JSON.stringify(loadedResult), "utf8")).toBeLessThanOrEqual(49_152);
  });
});
