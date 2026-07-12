import { getPrisma } from "@/lib/prisma";
import { toJson } from "@/lib/json";
import { planDto } from "@/lib/dto";
import type {
  CareerPlanDto,
  PlanGenerationMeta,
  PlanMilestone,
  PlanVersionDiff,
  UnifiedPlan,
} from "@/lib/types";

// ── 错误 ────────────────────────────────────────────────

export class ReplanServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
    this.name = "ReplanServiceError";
  }
}

// ── 校验 ────────────────────────────────────────────────

function validateUnifiedPlan(plan: unknown): asserts plan is UnifiedPlan {
  const p = plan as Record<string, unknown> | null | undefined;
  if (!p || typeof p !== "object") {
    throw new ReplanServiceError("计划结构无效", "INVALID_PLAN", 400);
  }
  const dir = p.direction as Record<string, unknown> | undefined;
  if (!dir || typeof dir.summary !== "string" || !dir.summary.trim()) {
    throw new ReplanServiceError("计划缺少方向概述", "INVALID_PLAN", 400);
  }
  if (!Array.isArray(p.milestones)) {
    throw new ReplanServiceError("计划缺少里程碑", "INVALID_PLAN", 400);
  }
  if (!p.tasks || typeof p.tasks !== "object") {
    throw new ReplanServiceError("计划缺少90天任务", "INVALID_PLAN", 400);
  }
}

// ── 差异生成 ────────────────────────────────────────────

function generateDiff(
  oldPlan: Record<string, unknown>,
  newPlan: UnifiedPlan,
): PlanVersionDiff {
  const oldDir = (oldPlan.direction as Record<string, unknown> | undefined)?.summary;
  const directionChange = oldDir !== newPlan.direction.summary;

  const oldMilestones = (Array.isArray(oldPlan.milestones)
    ? oldPlan.milestones
    : []) as PlanMilestone[];
  const newMilestones = newPlan.milestones;

  const oldGoals = new Set(oldMilestones.map((m) => m.goal));
  const newGoals = new Set(newMilestones.map((m) => m.goal));

  const addedMilestones = newMilestones.filter((m) => !oldGoals.has(m.goal));
  const removedMilestones = oldMilestones.filter((m) => !newGoals.has(m.goal));

  const oldTasks = new Set(
    (Array.isArray((oldPlan.tasks as Record<string, unknown>)?.tasks)
      ? ((oldPlan.tasks as Record<string, unknown>).tasks as Array<{ title: string }>)
      : []
    ).map((t) => t.title),
  );
  const newTasks = newPlan.tasks.tasks.map((t) => t.title);

  const addedTasks = newTasks.filter((t) => !oldTasks.has(t));
  const removedTasks = Array.from(oldTasks).filter((t) => !new Set(newTasks).has(t));

  return {
    directionChange,
    directionSummary: directionChange
      ? `方向从"${oldDir}"变更为"${newPlan.direction.summary}"`
      : undefined,
    addedMilestones,
    removedMilestones,
    addedTasks,
    removedTasks,
  };
}

// ── 服务接口 ────────────────────────────────────────────

export interface ReplanService {
  proposeReplan(
    userId: string,
    plan: UnifiedPlan,
    meta: PlanGenerationMeta,
  ): Promise<string>;

  acceptReplan(
    planId: string,
    userId: string,
  ): Promise<{
    old: CareerPlanDto | null;
    new: CareerPlanDto;
    diff: PlanVersionDiff;
  }>;

  generateDiff(
    oldPlan: Record<string, unknown>,
    newPlan: UnifiedPlan,
  ): PlanVersionDiff;
}

// ── 实现 ────────────────────────────────────────────────

export function createReplanService(): ReplanService {
  const db = getPrisma();

  return {
    async proposeReplan(userId, plan, meta) {
      // 结构化校验——失败零写入
      validateUnifiedPlan(plan);

      const row = await db.careerPlan.create({
        data: {
          userId,
          targetRole: plan.direction.targetRole,
          version: 1,
          status: "pending",
          years: "[]",
          quarters: "[]",
          months: toJson(plan.milestones),
          currentMonthIndex: 1,
          assumptions: "[]",
          riskNotes: "[]",
          generationMeta: toJson(meta),
          sourceReportId: null,
        },
      });

      return row.id;
    },

    async acceptReplan(planId, userId) {
      return db.$transaction(async (transaction) => {
      // 查找待确认计划，校验所有权
      const pending = await transaction.careerPlan.findFirst({
        where: { id: planId, userId, status: "pending" },
      });
      if (!pending) {
        throw new ReplanServiceError("重规划候选不存在", "NOT_FOUND", 404);
      }

      // 归档所有当前 active 计划
      const activePlans = await transaction.careerPlan.findMany({
        where: { userId, status: "active" },
      });
      for (const active of activePlans) {
        await transaction.careerPlan.update({
          where: { id: active.id },
          data: { status: "archived" },
        });
      }

      // pending 计划在生成时已经分配版本；仅当旧 active 版本更高时才补齐。
      const maxActiveVersion = Math.max(0, ...activePlans.map((p) => p.version));
      const newVersion = Math.max(pending.version, maxActiveVersion + 1);

      const activated = await transaction.careerPlan.update({
        where: { id: planId },
        data: { status: "active", version: newVersion },
      });

      const oldPlan = activePlans[0] ?? null;
      const oldDto = oldPlan ? planDto({ ...oldPlan, status: "archived" }) : null;
      const newDto = planDto(activated);
      const directionChange = oldPlan
        ? oldPlan.targetRole !== activated.targetRole
        : true;

      return {
        old: oldDto,
        new: newDto,
        diff: {
          directionChange,
          directionSummary: directionChange
            ? `目标方向调整为“${activated.targetRole}”`
            : undefined,
          addedMilestones: [],
          removedMilestones: [],
          addedTasks: [],
          removedTasks: [],
        },
      };
      });
    },

    generateDiff,
  };
}
