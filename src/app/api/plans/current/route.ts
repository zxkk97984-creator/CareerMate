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

  const generationLog = plan ? await getPrisma().progressLog.findFirst({
    where: { userId: user.id, relatedPlanId: plan.id, eventType: "plan_generated" },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
  }) : null;
  let executionMeta: z.infer<typeof executionMetaSchema> | null = null;
  if (generationLog) {
    try {
      const parsed = executionMetaSchema.safeParse(JSON.parse(generationLog.metadata));
      executionMeta = parsed.success ? parsed.data : null;
    } catch {
      executionMeta = null;
    }
  }

  return ok({ plan: plan ? planDto(plan) : null, executionMeta });
}

const executionMetaSchema = z.object({
  requestedMode: z.enum(["api", "manual", "mock"]),
  actualMode: z.enum(["api", "manual", "mock"]),
  degraded: z.boolean(),
  fallbackReason: z.string().nullable(),
  source: z.string(),
});
import { z } from "zod";
