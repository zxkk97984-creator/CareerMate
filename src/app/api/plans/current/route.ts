import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { planDto } from "@/lib/dto";
import { getPrisma } from "@/lib/prisma";

export async function GET() {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const plan = await getPrisma().careerPlan.findFirst({
    where: { userId: user.id, status: "active" },
    orderBy: { createdAt: "desc" },
  });

  return ok({ plan: plan ? planDto(plan) : null });
}
