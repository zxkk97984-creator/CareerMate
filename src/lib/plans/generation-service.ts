import { serializePlan } from "@/lib/career";
import { planDto, profileDto } from "@/lib/dto";
import { parseJson, toJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";
import { generatePlanWithTbox } from "@/lib/tbox";
import type { AiExecutionMeta, CareerPlanDto } from "@/lib/types";

const UNFINISHED_STATUSES = ["generating", "processing", "pending"];
const PROCESSING_STALE_MS = 2 * 60 * 1000;

export class PlanGenerationError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
    this.name = "PlanGenerationError";
  }
}

interface PlanGenerationDependencies {
  db?: ReturnType<typeof getPrisma>;
  generatePlan?: typeof generatePlanWithTbox;
  now?: () => Date;
}

export interface PlanGenerationService {
  ensureGenerationPlan(input: {
    userId: string;
    conversationId?: string;
  }): Promise<{ plan: CareerPlanDto; reused: boolean }>;
  generate(planId: string, userId: string): Promise<{
    plan: CareerPlanDto;
    executionMeta: AiExecutionMeta;
  }>;
}

function metadata(value: string) {
  return parseJson<Record<string, unknown>>(value, {});
}

function safeExecutionMeta(value: string): AiExecutionMeta {
  const stored = metadata(value);
  return {
    requestedMode: stored.requestedMode === "api" || stored.requestedMode === "manual" || stored.requestedMode === "mock"
      ? stored.requestedMode
      : "mock",
    actualMode: stored.actualMode === "api" || stored.actualMode === "manual" || stored.actualMode === "mock"
      ? stored.actualMode
      : "mock",
    degraded: Boolean(stored.degraded),
    fallbackReason: typeof stored.fallbackReason === "string" ? stored.fallbackReason : null,
    source: typeof stored.source === "string" ? stored.source : "unknown",
  };
}

export function createPlanGenerationService(
  dependencies: PlanGenerationDependencies = {},
): PlanGenerationService {
  const db = dependencies.db ?? getPrisma();
  const generatePlan = dependencies.generatePlan ?? generatePlanWithTbox;
  const now = dependencies.now ?? (() => new Date());

  return {
    async ensureGenerationPlan(input) {
      return db.$transaction(async (transaction) => {
        const existing = await transaction.careerPlan.findFirst({
          where: {
            userId: input.userId,
            status: { in: UNFINISHED_STATUSES },
          },
          orderBy: { createdAt: "desc" },
        });
        if (existing) return { plan: planDto(existing), reused: true };

        const profile = await transaction.userProfile.findUnique({
          where: { userId: input.userId },
        });
        if (!profile) {
          throw new PlanGenerationError("用户画像不存在", "PROFILE_NOT_FOUND", 404);
        }
        const latest = await transaction.careerPlan.findFirst({
          where: { userId: input.userId },
          orderBy: { version: "desc" },
        });
        const created = await transaction.careerPlan.create({
          data: {
            userId: input.userId,
            targetRole: profile.targetRole,
            version: (latest?.version ?? 0) + 1,
            status: "generating",
            years: "[]",
            quarters: "[]",
            months: "[]",
            currentMonthIndex: 1,
            assumptions: "[]",
            riskNotes: "[]",
            generationMeta: toJson({
              triggeredBy: "chat",
              conversationId: input.conversationId,
              attempts: 0,
              generationState: "generating",
            }),
          },
        });
        return { plan: planDto(created), reused: false };
      });
    },

    async generate(planId, userId) {
      const current = await db.careerPlan.findFirst({
        where: { id: planId, userId },
      });
      if (!current) {
        throw new PlanGenerationError("计划生成任务不存在", "NOT_FOUND", 404);
      }
      if (current.status === "pending" || current.status === "active") {
        return { plan: planDto(current), executionMeta: safeExecutionMeta(current.generationMeta) };
      }
      if (!["generating", "generation_failed", "processing"].includes(current.status)) {
        throw new PlanGenerationError("当前计划状态不能生成", "INVALID_STATE", 409);
      }

      const startedAt = now();
      const staleBefore = new Date(startedAt.getTime() - PROCESSING_STALE_MS);
      const claimed = await db.careerPlan.updateMany({
        where: {
          id: planId,
          userId,
          OR: [
            { status: { in: ["generating", "generation_failed"] } },
            { status: "processing", updatedAt: { lte: staleBefore } },
          ],
        },
        data: {
          status: "processing",
          generationMeta: toJson({
            ...metadata(current.generationMeta),
            generationState: "processing",
            lastStartedAt: startedAt.toISOString(),
          }),
        },
      });
      if (claimed.count !== 1) {
        throw new PlanGenerationError("计划正在生成中", "PLAN_IN_PROGRESS", 409);
      }

      const profile = await db.userProfile.findUnique({ where: { userId } });
      if (!profile) {
        throw new PlanGenerationError("用户画像不存在", "PROFILE_NOT_FOUND", 404);
      }
      const previousMeta = metadata(current.generationMeta);
      const attempts = typeof previousMeta.attempts === "number" ? previousMeta.attempts + 1 : 1;

      try {
        const generated = await generatePlan(profileDto(profile));
        const updated = await db.careerPlan.update({
          where: { id: planId },
          data: {
            status: "pending",
            targetRole: profile.targetRole,
            ...serializePlan(generated.data),
            generationMeta: toJson({
              ...previousMeta,
              ...generated.meta,
              attempts,
              generationState: "completed",
              completedAt: now().toISOString(),
            }),
          },
        });
        return { plan: planDto(updated), executionMeta: generated.meta };
      } catch {
        await db.careerPlan.update({
          where: { id: planId },
          data: {
            status: "generation_failed",
            generationMeta: toJson({
              ...previousMeta,
              attempts,
              generationState: "failed",
              failureCode: "TBOX_GENERATION_FAILED",
              failedAt: now().toISOString(),
            }),
          },
        });
        throw new PlanGenerationError(
          "计划生成暂时失败，可以稍后重试",
          "PLAN_GENERATION_FAILED",
          502,
        );
      }
    },
  };
}
