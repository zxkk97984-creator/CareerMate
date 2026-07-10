import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { serializePlan } from "@/lib/career";
import { planDto, profileDto } from "@/lib/dto";
import { getPrisma } from "@/lib/prisma";
import { generatePlanWithTbox, planGenerationNote } from "@/lib/tbox";

export async function POST() {
  const user = await requireCurrentUser().catch(() => null);
  if (!user?.profile) return fail("UNAUTHORIZED", "未登录或缺少画像", 401);

  const profile = profileDto(user.profile);
  const generated = await generatePlanWithTbox(profile);
  const note = planGenerationNote(generated.meta);

  await getPrisma().careerPlan.updateMany({
    where: { userId: user.id, status: "active" },
    data: { status: "archived" },
  });

  const latest = await getPrisma().careerPlan.findFirst({
    where: { userId: user.id },
    orderBy: { version: "desc" },
  });

  const plan = await getPrisma().careerPlan.create({
    data: {
      userId: user.id,
      targetRole: profile.targetRole,
      version: (latest?.version ?? 0) + 1,
      ...serializePlan(generated.data),
    },
  });

  await getPrisma().progressLog.create({
    data: {
      userId: user.id,
      eventType: "plan_generated",
      title: "生成 3 年职业路径",
      summary: note,
      metadata: JSON.stringify(generated.meta),
    },
  });

  return ok(
    { plan: planDto(plan), note },
    generated.meta as unknown as Record<string, unknown>,
  );
}
