import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { planDto } from "@/lib/dto";
import { getPrisma } from "@/lib/prisma";

/**
 * 历史版本只读列表：只返回当前用户已结束或非执行中的计划版本，
 * 与当前执行计划分开展示，不把历史版本混入主线任务。
 */
export async function GET() {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const plans = await getPrisma().careerPlan.findMany({
    where: {
      userId: user.id,
      status: { in: ["archived", "inactive", "rejected", "superseded"] },
    },
    orderBy: [{ version: "desc" }],
    take: 50,
  });

  return ok({
    items: plans.map((plan) => planDto(plan, {
      weeklyBudgetHours: user.profile?.weeklyAvailableHours ?? null,
    })),
  });
}
