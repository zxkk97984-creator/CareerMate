import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { planDto } from "@/lib/dto";
import { getPrisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态已过期", 401);
  const { planId } = await params;
  const plan = await getPrisma().careerPlan.findFirst({
    where: { id: planId, userId: user.id },
  });
  if (!plan) return fail("NOT_FOUND", "职业计划不存在", 404);
  return ok({ plan: planDto(plan) });
}
