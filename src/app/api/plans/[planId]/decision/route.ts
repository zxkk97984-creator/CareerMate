import { requireCurrentUser } from "@/lib/auth";
import { fail, ok } from "@/lib/api";
import { getPrisma } from "@/lib/prisma";
import { z } from "zod";

const decisionSchema = z.object({
  action: z.enum(["accept", "reject"]),
}).strict();

// ── POST /api/plans/:planId/decision ──────────────────

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

  // 查找 pending 计划
  const pending = await db.careerPlan.findFirst({
    where: { id: planId, userId: user.id, status: "pending" },
  });
  if (!pending) return fail("NOT_FOUND", "计划不存在或状态不是待确认", 404);

  if (input.data.action === "accept") {
    await db.$transaction(async (tx) => {
      // 归档当前 active 计划
      const active = await tx.careerPlan.findFirst({
        where: { userId: user.id, status: "active", targetRole: pending.targetRole },
      });
      if (active) {
        await tx.careerPlan.update({
          where: { id: active.id },
          data: { status: "archived" },
        });
      }

      // 激活 pending
      await tx.careerPlan.update({
        where: { id: planId },
        data: {
          status: "active",
          activatedAt: new Date(),
        },
      });
    });

    return ok({ activated: true, planId });
  }

  // reject
  await db.careerPlan.update({
    where: { id: planId },
    data: { status: "rejected" },
  });

  return ok({ rejected: true, planId });
}
