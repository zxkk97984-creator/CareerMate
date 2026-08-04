import { ok, fail } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export async function GET() {
  const user = await requireCurrentUser().catch(() => null);
  if (!user?.id) return fail("UNAUTHORIZED", "未登录", 401);

  const route = await getPrisma().learningRoute.findFirst({
    where: { userId: user.id, status: "active" },
    orderBy: { version: "desc" },
  });

  if (!route) {
    return ok({ route: null });
  }

  let content: unknown = {};
  try {
    content = JSON.parse(route.content);
  } catch { /* fallback */ }

  const relatedPlan = route.relatedPlanId
      ? await getPrisma().careerPlan.findFirst({
        where: { id: route.relatedPlanId, userId: user.id },
        select: { id: true, targetRole: true, targetRoleLabel: true, version: true, status: true },
      })
    : null;

  return ok({
    route: {
      id: route.id,
      version: route.version,
      status: route.status,
      schemaVersion: route.schemaVersion,
      content,
      basePlanVersion: route.basePlanVersion,
      relatedPlan: relatedPlan
        ? {
            id: relatedPlan.id,
            targetRole: relatedPlan.targetRole,
            targetRoleLabel: relatedPlan.targetRoleLabel,
            version: relatedPlan.version,
            status: relatedPlan.status,
          }
        : null,
      createdAt: route.createdAt.toISOString(),
      updatedAt: route.updatedAt.toISOString(),
    },
  });
}
