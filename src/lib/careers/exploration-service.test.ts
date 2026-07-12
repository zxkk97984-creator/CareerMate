import { describe, expect, it, vi } from "vitest";
import { getPrisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({ getPrisma: vi.fn() }));

const { createExplorationService } = await import("./exploration-service");

// ── 辅助 ──────────────────────────────────────────────────

function reportRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "rpt-1",
    userId: "user-1",
    conversationId: "conv-1",
    roleName: "用户研究员",
    roleKey: null,
    status: "exploratory",
    content: JSON.stringify({
      roleName: "用户研究员",
      summary: "用户研究员负责理解用户需求",
      responsibilities: ["用户访谈", "可用性测试"],
      coreCompetencies: ["研究方法", "数据分析"],
      entryPaths: ["心理学背景", "设计背景"],
      marketSignals: ["需求增长"],
      learningSuggestions: ["学习用户研究基础"],
      fitAnalysis: ["AI推断: 与你的沟通能力匹配"],
      risksAndUncertainties: ["行业竞争激烈"],
      sources: [{ title: "职业百科", organization: "官方", label: "已核验职业库", accessedAt: "2026-07-12" }],
    }),
    sources: JSON.stringify([{ title: "职业百科", organization: "官方", label: "已核验职业库", accessedAt: "2026-07-12" }]),
    executionMeta: "{}",
    generatedAt: new Date("2026-07-12T10:00:00Z"),
    createdAt: new Date("2026-07-12T10:00:00Z"),
    updatedAt: new Date("2026-07-12T10:00:00Z"),
    ...overrides,
  };
}

function setupService() {
  const mockPrisma: any = {
    careerExplorationReport: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    roleDraft: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    roleTemplate: {
      findUnique: vi.fn(),
    },
  };
  mockPrisma.$transaction = vi.fn(async (callback: (transaction: typeof mockPrisma) => unknown) => callback(mockPrisma));
  (getPrisma as any).mockReturnValue(mockPrisma);
  const svc = createExplorationService();
  return { svc, mock: mockPrisma };
}

// ── 测试 ──────────────────────────────────────────────────

describe("ExplorationService", () => {
  describe("createReport", () => {
    it("创建职业探索报告并验证 schema", async () => {
      const { svc, mock } = setupService();
      mock.careerExplorationReport.create.mockResolvedValue(reportRow());

      const result = await svc.createReport({
        userId: "user-1",
        conversationId: "conv-1",
        report: {
          roleName: "用户研究员",
          summary: "用户研究员负责理解用户需求",
          responsibilities: ["用户访谈", "可用性测试"],
          coreCompetencies: ["研究方法", "数据分析"],
          entryPaths: ["心理学背景"],
          marketSignals: ["需求增长"],
          learningSuggestions: ["学习用户研究基础"],
          fitAnalysis: ["AI推断: 与你的沟通能力匹配"],
          risksAndUncertainties: ["行业竞争激烈"],
          sources: [{ title: "职业百科", organization: "官方", label: "已核验职业库", accessedAt: "2026-07-12" }],
        },
      });

      expect(result.roleName).toBe("用户研究员");
      expect(result.status).toBe("exploratory");
    });

    it("报告 schema 校验失败时拒绝创建", async () => {
      const { svc } = setupService();
      await expect(
        svc.createReport({
          userId: "user-1",
          conversationId: null,
          report: { roleName: "" } as any, // 缺少必需字段
        })
      ).rejects.toThrow();
    });

    it("fitAnalysis 必须标注 AI 推断", async () => {
      const { svc, mock } = setupService();
      mock.careerExplorationReport.create.mockResolvedValue(reportRow());

      await svc.createReport({
        userId: "user-1",
        conversationId: null,
        report: {
          roleName: "测试岗位",
          summary: "概述",
          responsibilities: ["职责1"],
          coreCompetencies: ["能力1"],
          entryPaths: ["路径1"],
          marketSignals: ["信号1"],
          learningSuggestions: ["建议1"],
          fitAnalysis: ["这与你的背景匹配"], // 未标注AI推断
          risksAndUncertainties: ["风险1"],
          sources: [{
            title: "AI分析说明",
            organization: "CareerMate",
            accessedAt: "2026-07-12",
            label: "AI分析与推断",
          }],
        },
      });

      // fitAnalysis 应该被自动添加 AI 推断标注
      const content = JSON.parse(mock.careerExplorationReport.create.mock.calls[0][0].data.content);
      expect(content.fitAnalysis[0]).toContain("AI推断");
    });
  });

  describe("submitForReview", () => {
    it("提交报告生成去个人化的 RoleDraft", async () => {
      const { svc, mock } = setupService();
      mock.careerExplorationReport.findFirst.mockResolvedValue(reportRow());
      mock.roleDraft.create.mockResolvedValue({ id: "draft-1" });

      await svc.submitForReview("rpt-1", "user-1");

      expect(mock.$transaction).toHaveBeenCalledTimes(1);

      // 验证 RoleDraft 不含 fitAnalysis（个人内容）
      const draftData = mock.roleDraft.create.mock.calls[0][0].data;
      const draftContent = JSON.parse(draftData.content);
      expect(draftContent.fitAnalysis).toBeUndefined();
      expect(draftContent.roleName).toBe("用户研究员");
    });

    it("不能提交他人报告", async () => {
      const { svc, mock } = setupService();
      mock.careerExplorationReport.findFirst.mockResolvedValue(null);

      await expect(
        svc.submitForReview("rpt-1", "user-2")
      ).rejects.toThrow("报告不存在");
    });

    it("已提交的报告不可重复提交", async () => {
      const { svc, mock } = setupService();
      mock.careerExplorationReport.findFirst.mockResolvedValue(
        reportRow({ status: "submitted" })
      );

      await expect(
        svc.submitForReview("rpt-1", "user-1")
      ).rejects.toThrow("已提交");
    });

    it("并发提交命中唯一约束时返回已提交冲突", async () => {
      const { svc, mock } = setupService();
      mock.careerExplorationReport.findFirst.mockResolvedValue(reportRow());
      mock.roleDraft.create.mockRejectedValue({ code: "P2002" });

      await expect(svc.submitForReview("rpt-1", "user-1")).rejects.toMatchObject({
        code: "ALREADY_SUBMITTED",
        status: 409,
      });
    });
  });
});
