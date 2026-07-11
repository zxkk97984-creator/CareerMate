import { describe, expect, it, vi } from "vitest";
import { getPrisma } from "@/lib/prisma";
import type { PlanMilestone, PlanWeeklyAction, UnifiedPlan } from "@/lib/types";

vi.mock("@/lib/prisma", () => ({ getPrisma: vi.fn() }));

const { createReplanService } = await import("./replan-service");

// ── 辅助函数 ──────────────────────────────────────────────

function planRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "plan-1",
    userId: "user-1",
    targetRole: "ai_product_manager",
    version: 1,
    status: "active",
    years: "[]",
    quarters: "[]",
    months: "[]",
    currentMonthIndex: 1,
    assumptions: "[]",
    riskNotes: "[]",
    generationMeta: "{}",
    sourceReportId: null,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

function unifiedPlan(overrides: {
  direction?: Record<string, unknown>;
  milestones?: PlanMilestone[];
  tasks?: Record<string, unknown>;
  thisWeek?: PlanWeeklyAction[];
} = {}) {
  return {
    direction: {
      summary: "3年成为资深AI产品经理",
      targetRole: "ai_product_manager",
      keyCompetencies: ["产品设计", "数据分析", "AI技术理解"],
      ...overrides.direction,
    },
    milestones: ([
      { month: 3, goal: "完成基础学习", deliverables: ["证书A"], evaluationCriteria: ["通过考试"] },
    ] as PlanMilestone[]).concat(overrides.milestones ?? []),
    tasks: {
      goal: "90天掌握产品基础",
      tasks: [{ id: "t1", title: "学习PRD写作", type: "learning", status: "not_started", dueWeek: 2 }],
      ...overrides.tasks,
    },
    thisWeek: ([
      { title: "阅读产品入门书籍", description: "精读前三章", estimatedMinutes: 120, type: "learning" as const },
    ] as PlanWeeklyAction[]).concat(overrides.thisWeek ?? []),
  } as UnifiedPlan;
}

function setupService() {
  const mockPrisma = {
    careerPlan: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  (getPrisma as any).mockReturnValue(mockPrisma);
  const svc = createReplanService();
  return { svc, mock: mockPrisma };
}

// ── 测试 ──────────────────────────────────────────────────

describe("ReplanService", () => {
  describe("proposeReplan", () => {
    it("创建重规划候选不修改现有 active 计划", async () => {
      const { svc, mock } = setupService();
      const newPlan = unifiedPlan();

      mock.careerPlan.create.mockResolvedValue(
        planRow({ id: "plan-2", version: 1, status: "pending", updatedAt: new Date() })
      );

      await svc.proposeReplan("user-1", newPlan, {
        requestedMode: "mock",
        actualMode: "mock",
        degraded: false,
        fallbackReason: null,
        source: "tbox-api",
        triggeredBy: "chat",
      });

      // 不应修改现有 active 计划
      expect(mock.careerPlan.update).not.toHaveBeenCalled();
      expect(mock.careerPlan.updateMany).not.toHaveBeenCalled();
    });

    it("结构化校验失败零写入", async () => {
      const { svc, mock } = setupService();
      // 缺少 direction.summary
      const invalidPlan = { direction: { targetRole: "test" } } as any;

      await expect(
        svc.proposeReplan("user-1", invalidPlan, {
          requestedMode: "mock",
          actualMode: "mock",
          degraded: false,
          fallbackReason: null,
          source: "unknown",
          triggeredBy: "chat",
        })
      ).rejects.toThrow();

      // 不应写入任何数据
      expect(mock.careerPlan.create).not.toHaveBeenCalled();
    });
  });

  describe("acceptReplan", () => {
    it("用户确认后归档旧计划并激活新版本", async () => {
      const { svc, mock } = setupService();
      const oldPlan = planRow({ id: "plan-old", version: 2, status: "active" });
      const newPlan = planRow({ id: "plan-new", version: 2, status: "pending" });

      mock.careerPlan.findFirst.mockResolvedValueOnce(newPlan); // 查找待确认计划
      mock.careerPlan.findMany.mockResolvedValue([oldPlan]); // 查找旧active
      mock.careerPlan.update.mockImplementation((args: any) => {
        if (args.where.id === "plan-old") return Promise.resolve(planRow({ ...oldPlan, status: "archived" }));
        return Promise.resolve(planRow({ ...newPlan, status: "active", version: 3 }));
      });

      const result = await svc.acceptReplan("plan-new", "user-1");

      expect(result.new.status).toBe("active");
      expect(result.new.version).toBe(3);
      // 旧计划应被归档
      expect(mock.careerPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "plan-old" },
          data: expect.objectContaining({ status: "archived" }),
        })
      );
    });

    it("同时只有一个 active 计划——只归档 active，不动 archived", async () => {
      const { svc, mock } = setupService();
      const pending = planRow({ id: "plan-c", status: "pending" });

      mock.careerPlan.findFirst.mockResolvedValueOnce(pending);
      // Prisma findMany({ where: { status: "active" } }) 只返回 active 的
      mock.careerPlan.findMany.mockResolvedValue([planRow({ id: "plan-a", status: "active" })]);
      mock.careerPlan.update.mockImplementation((args: any) => {
        if (args.where.id === "plan-a")
          return Promise.resolve(planRow({ id: "plan-a", status: "archived" }));
        return Promise.resolve(planRow({ id: "plan-c", status: "active", version: 2 }));
      });

      await svc.acceptReplan("plan-c", "user-1");

      // plan-a 被归档
      expect(mock.careerPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "plan-a" },
          data: expect.objectContaining({ status: "archived" }),
        })
      );
    });

    it("跨用户隔离——不能确认他人计划", async () => {
      const { svc, mock } = setupService();
      mock.careerPlan.findFirst.mockResolvedValue(null);

      await expect(
        svc.acceptReplan("plan-new", "user-2")
      ).rejects.toThrow("重规划候选不存在");
    });

    it("版本号正确递增", async () => {
      const { svc, mock } = setupService();
      mock.careerPlan.findFirst.mockResolvedValueOnce(
        planRow({ id: "plan-new", version: 5, status: "pending" })
      );
      mock.careerPlan.findMany.mockResolvedValue([]);
      mock.careerPlan.update.mockResolvedValue(
        planRow({ id: "plan-new", status: "active", version: 6 })
      );

      const result = await svc.acceptReplan("plan-new", "user-1");

      expect(result.new.version).toBe(6);
    });
  });

  describe("generateDiff", () => {
    it("生成新旧差异对象", () => {
      const { svc } = setupService();
      const oldPlan = {
        direction: { summary: "旧方向" },
        milestones: [{ month: 3, goal: "旧目标", deliverables: [], evaluationCriteria: [] }],
      };
      const newPlan = unifiedPlan();

      const diff = svc.generateDiff(oldPlan as any, newPlan);

      expect(diff.directionChange).toBe(true);
      expect(diff.directionSummary).toBeDefined();
    });

    it("无变化时 directionChange 为 false", () => {
      const { svc } = setupService();
      const plan = unifiedPlan();
      const samePlan = {
        direction: { summary: plan.direction.summary },
        milestones: plan.milestones,
      };

      const diff = svc.generateDiff(samePlan as any, plan);

      expect(diff.directionChange).toBe(false);
    });
  });
});
