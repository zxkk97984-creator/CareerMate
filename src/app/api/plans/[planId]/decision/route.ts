import { requireCurrentUser } from "@/lib/auth";
import { fail, ok } from "@/lib/api";
import { getPrisma } from "@/lib/prisma";
import { z } from "zod";

const decisionSchema = z.object({
  action: z.enum(["accept", "reject"]),
}).strict();

// ── POST /api/plans/:planId/decision ──────────────────
// 原子 CAS：仅 status=pending 时接受/拒绝，并发操作只有一个成功

export async function POST(
  request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录", 401);

  const { planId } = await params;
  const body = await request.json().catch(() => ({}));
  const input = decisionSchema.safeParse(body);
  if (!input.success) return fail("INVALID_PARAMS", "参数不合法", 400);

  const db = getPrisma();

  if (input.data.action === "accept") {
    try {
      await db.$transaction(async (tx) => {
        // 原子 claim：仅 status=pending 时才可接受
        const claimed = await tx.careerPlan.updateMany({
          where: { id: planId, userId: user.id, status: "pending" },
          data: { status: "activating" },
        });
        if (claimed.count !== 1) {
          throw new PlanDecisionConflictError("计划已被处理，无法重复操作");
        }

        // 归档该用户所有旧的 active 计划
        await tx.careerPlan.updateMany({
          where: { userId: user.id, status: "active" },
          data: { status: "archived" },
        });

        // 激活 pending
        await tx.careerPlan.update({
          where: { id: planId },
          data: { status: "active", activatedAt: new Date() },
        });

        // 令相关会话 contextVersion 失效
        await tx.chatConversation.updateMany({
          where: { userId: user.id, status: { not: "deleted" } },
          data: { contextVersion: { increment: 1 } },
        });
      });
    } catch (err) {
      if (err instanceof PlanDecisionConflictError) {
        return fail("PLAN_ALREADY_RESOLVED", err.message, 409);
      }
      throw err;
    }

    const updated = await db.careerPlan.findUnique({ where: { id: planId } });
    return ok({ new: { id: planId, status: updated?.status ?? "active" } });
  }

  // reject：原子 CAS，仅 status=pending 时可拒绝
  const rejected = await db.careerPlan.updateMany({
    where: { id: planId, userId: user.id, status: "pending" },
    data: { status: "rejected" },
  });
  if (rejected.count !== 1) {
    return fail("PLAN_ALREADY_RESOLVED", "计划已被处理，无法重复操作", 409);
  }

  return ok({ rejected: true, planId });
}

class PlanDecisionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanDecisionConflictError";
  }
}
