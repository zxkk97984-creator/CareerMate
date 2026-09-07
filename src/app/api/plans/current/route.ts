import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { planDto } from "@/lib/dto";
import { getPrisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET() {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const plan = await getPrisma().careerPlan.findFirst({
    where: { userId: user.id, status: "active" },
    orderBy: { createdAt: "desc" },
  });
  const pendingPlan = await getPrisma().careerPlan.findFirst({
    where: {
      userId: user.id,
      status: { in: ["generating", "processing", "pending", "generation_failed"] },
    },
    orderBy: { createdAt: "desc" },
  });

  // 存在待确认计划时优先显示它的执行元信息，避免“已生成但看不到真实/降级状态”。
  const metaPlan = pendingPlan ?? plan;
  const generationLog = metaPlan ? await getPrisma().progressLog.findFirst({
    where: { userId: user.id, relatedPlanId: metaPlan.id, eventType: "plan_generated" },
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

  return ok({
    plan: plan ? planDto(plan) : null,
    pendingPlan: pendingPlan ? planDto(pendingPlan) : null,
    executionMeta,
  });
}

const executionMetaSchema = z.object({
  requestedMode: z.enum(["api", "manual", "mock"]),
  actualMode: z.enum(["api", "manual", "mock"]),
  degraded: z.boolean(),
  fallbackReason: z.string().nullable(),
  source: z.string(),
});
