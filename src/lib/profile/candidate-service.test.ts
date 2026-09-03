import { describe, expect, it, vi } from "vitest";
import { getPrisma } from "@/lib/prisma";

// Mock Prisma 客户端，让测试不接触真实数据库
vi.mock("@/lib/prisma", () => ({ getPrisma: vi.fn() }));

// 在所有 mock 设置完成后，再导入被测模块
const { createCandidateService } = await import("./candidate-service");

// ── 辅助函数 ──────────────────────────────────────────────

/** 模拟一条数据库候选行 */
function candidateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cand-1",
    userId: "user-1",
    source: "chat",
    field: "targetRoleLabel",
    oldValue: '"开发工程师"',
    newValue: '"用户研究员"',
    confidence: 0.85,
    requiresConfirmation: true,
    reason: "根据对话分析",
    sourceConversationId: "conv-1",
    evidenceExcerpt: "我喜欢研究用户行为",
    impactSummary: "需要更新学习路径",
    abilityEvidenceId: "ev-1",
    status: "pending",
    createdAt: new Date("2026-07-12T10:00:00Z"),
    ...overrides,
  };
}

/** 模拟一条数据库画像行 */
function profileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "profile-1",
    userId: "user-1",
    educationStage: "在职",
    major: "计算机科学",
    targetRole: "ai_product_manager",
    targetRoleLabel: "AI产品经理",
    weeklyAvailableHours: 15,
    learningPreference: '["视频","项目"]',
    experienceSummary: "3年后端开发经验",
    interestTags: '["AI","产品设计"]',
    constraints: '["时间有限"]',
    abilityScores: '{"aiTooling":45,"roleFoundation":60,"dataAnalysis":40,"businessProduct":35,"communication":50,"projectPractice":30}',
    memoryEnabled: true,
    onboardingCompleted: true,
    ...overrides,
  };
}

/** 模拟一条数据库能力证据行 */
function evidenceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ev-1",
    userId: "user-1",
    abilityKey: "roleFoundation",
    summary: "用户在对话中展现了对用户研究方法的理解",
    sourceType: "chat",
    sourceRef: "conv-1",
    confidence: 0.85,
    status: "pending",
    observedAt: new Date("2026-07-12T10:00:00Z"),
    ...overrides,
  };
}

/** 创建带有模拟 Prisma 的 CandidateService 实例 */
function setupService() {
  const mockPrisma: any = {
    profileUpdateCandidate: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    userProfile: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    abilityEvidence: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
  mockPrisma.$transaction = vi.fn(
    async (operation: (transaction: typeof mockPrisma) => Promise<unknown>) =>
      operation(mockPrisma),
  );

  (getPrisma as any).mockReturnValue(mockPrisma);
  const svc = createCandidateService();
  return { svc, mock: mockPrisma };
}

// ── 测试 ──────────────────────────────────────────────────

describe("CandidateService", () => {
  describe("ALLOWED_CANDIDATE_FIELDS", () => {
    it("非法字段拒绝写入", async () => {
      const { svc, mock } = setupService();
      mock.profileUpdateCandidate.findFirst.mockResolvedValue(
        candidateRow({ field: "passwordHash" })
      );

      await expect(
        svc.processCandidate("cand-1", "user-1", "accept")
      ).rejects.toThrow("不允许修改该字段");
    });

    it("合法字段通过白名单检查", async () => {
      const { svc, mock } = setupService();
      mock.profileUpdateCandidate.findFirst.mockResolvedValue(candidateRow());
      mock.userProfile.findUnique.mockResolvedValue(profileRow());
      mock.profileUpdateCandidate.update.mockResolvedValue(
        candidateRow({ status: "accepted" })
      );

      const result = await svc.processCandidate("cand-1", "user-1", "accept");

      expect(result.status).toBe("accepted");
    });
  });

  describe("accept", () => {
    it("在一个事务中更新画像、证据和候选状态", async () => {
      const { svc, mock } = setupService();
      mock.profileUpdateCandidate.findFirst.mockResolvedValue(candidateRow());
      mock.userProfile.findUnique.mockResolvedValue(profileRow());
      mock.abilityEvidence.findUnique.mockResolvedValue(evidenceRow());
      mock.profileUpdateCandidate.update.mockResolvedValue(
        candidateRow({ status: "accepted" }),
      );

      await svc.processCandidate("cand-1", "user-1", "accept");

      expect(mock.$transaction).toHaveBeenCalledTimes(1);
    });

    it("接受候选更新画像直接字段", async () => {
      const { svc, mock } = setupService();
      mock.profileUpdateCandidate.findFirst.mockResolvedValue(
        candidateRow({ field: "targetRoleLabel", newValue: '"用户研究员"' })
      );
      mock.userProfile.findUnique.mockResolvedValue(profileRow());
      mock.profileUpdateCandidate.update.mockResolvedValue(
        candidateRow({ status: "accepted" })
      );

      const result = await svc.processCandidate("cand-1", "user-1", "accept");

      expect(result.status).toBe("accepted");
      expect(mock.userProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1" },
          data: expect.objectContaining({ targetRoleLabel: "用户研究员" }),
        })
      );
    });

    it("接受能力分数候选正确更新 abilityScores", async () => {
      const { svc, mock } = setupService();
      // 注意: newValue 存储的是 JSON 序列化后的字符串。
      // JSON.stringify(72) → "72"，所以 Prisma 返回的 candidate.newValue 就是字符串 "72"
      mock.profileUpdateCandidate.findFirst.mockResolvedValue(
        candidateRow({ field: "abilityScores.roleFoundation", newValue: "72" })
      );
      mock.userProfile.findUnique.mockResolvedValue(profileRow());
      mock.profileUpdateCandidate.update.mockResolvedValue(
        candidateRow({ status: "accepted", field: "abilityScores.roleFoundation" })
      );

      await svc.processCandidate("cand-1", "user-1", "accept");

      expect(mock.userProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            abilityScores: expect.stringContaining('"roleFoundation":72'),
          }),
        })
      );
    });

    it("能力分限定在 0–100 范围", async () => {
      const { svc, mock } = setupService();
      mock.profileUpdateCandidate.findFirst.mockResolvedValue(
        candidateRow({ field: "abilityScores.aiTooling", newValue: "150" })
      );
      mock.userProfile.findUnique.mockResolvedValue(profileRow());

      await expect(
        svc.processCandidate("cand-1", "user-1", "accept")
      ).rejects.toThrow("能力分必须在0到100之间");
    });

    it("接受后关联证据状态变为 confirmed", async () => {
      const { svc, mock } = setupService();
      mock.profileUpdateCandidate.findFirst.mockResolvedValue(candidateRow());
      mock.userProfile.findUnique.mockResolvedValue(profileRow());
      mock.abilityEvidence.findUnique.mockResolvedValue(evidenceRow());
      mock.profileUpdateCandidate.update.mockResolvedValue(
        candidateRow({ status: "accepted" })
      );

      await svc.processCandidate("cand-1", "user-1", "accept");

      expect(mock.abilityEvidence.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ev-1" },
          data: { status: "confirmed" },
        })
      );
    });
  });

  describe("edit", () => {
    it("edit 修改候选值并确认", async () => {
      const { svc, mock } = setupService();
      mock.profileUpdateCandidate.findFirst.mockResolvedValue(
        candidateRow({ field: "targetRoleLabel", newValue: '"用户研究员"' })
      );
      mock.userProfile.findUnique.mockResolvedValue(profileRow());
      mock.profileUpdateCandidate.update.mockImplementation((args: any) =>
        Promise.resolve(candidateRow({ status: "accepted", newValue: args.data.newValue }))
      );

      const result = await svc.processCandidate(
        "cand-1", "user-1", "edit", undefined, '"UX研究员"'
      );

      expect(result.status).toBe("accepted");
      expect(result.newValue).toBe("UX研究员");
    });

    it("每周可投入时间拒绝字符串值", async () => {
      const { svc, mock } = setupService();
      mock.profileUpdateCandidate.findFirst.mockResolvedValue(
        candidateRow({ field: "weeklyAvailableHours", newValue: "8" }),
      );
      mock.userProfile.findUnique.mockResolvedValue(profileRow());

      await expect(
        svc.processCandidate("cand-1", "user-1", "edit", undefined, '"8"'),
      ).rejects.toThrow("每周可投入时间必须是1到168之间的整数");
    });
  });

  describe("reject", () => {
    it("拒绝后候选状态变 rejected，证据和画像不变", async () => {
      const { svc, mock } = setupService();
      mock.profileUpdateCandidate.findFirst.mockResolvedValue(candidateRow());
      mock.profileUpdateCandidate.update.mockResolvedValue(
        candidateRow({ status: "rejected" })
      );

      const result = await svc.processCandidate("cand-1", "user-1", "reject");

      expect(result.status).toBe("rejected");
      expect(mock.abilityEvidence.update).not.toHaveBeenCalled();
      expect(mock.userProfile.update).not.toHaveBeenCalled();
    });
  });

  describe("幂等性", () => {
    it("已接受候选再次操作返回错误", async () => {
      const { svc, mock } = setupService();
      mock.profileUpdateCandidate.findFirst.mockResolvedValue(
        candidateRow({ status: "accepted" })
      );

      await expect(
        svc.processCandidate("cand-1", "user-1", "accept")
      ).rejects.toThrow("该候选已经处理过");
    });

    it("已拒绝候选再次操作返回错误", async () => {
      const { svc, mock } = setupService();
      mock.profileUpdateCandidate.findFirst.mockResolvedValue(
        candidateRow({ status: "rejected" })
      );

      await expect(
        svc.processCandidate("cand-1", "user-1", "accept")
      ).rejects.toThrow("该候选已经处理过");
    });
  });

  describe("隔离", () => {
    it("跨用户操作返回不存在", async () => {
      const { svc, mock } = setupService();
      mock.profileUpdateCandidate.findFirst.mockResolvedValue(null);

      await expect(
        svc.processCandidate("cand-1", "user-2", "accept")
      ).rejects.toThrow("画像更新候选不存在");
    });
  });
});
