import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { isClearConfirmation } from "@/lib/privacy";
import { createIncompleteProfileDefaults } from "@/lib/profile-defaults";
import { getPrisma } from "@/lib/prisma";

const schema = z.object({ confirmation: z.string() }).strict();

export async function DELETE(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isClearConfirmation(parsed.data.confirmation)) return fail("CONFIRMATION_MISMATCH", "确认词不正确", 400);
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    await tx.simulationSession.deleteMany({ where: { userId: user.id } });
    await tx.profileUpdateCandidate.deleteMany({ where: { userId: user.id } });
    await tx.careerPlan.deleteMany({ where: { userId: user.id } });
    await tx.progressLog.deleteMany({ where: { userId: user.id } });
    await tx.memoryItem.deleteMany({ where: { userId: user.id } });
    await tx.onboardingConversation.deleteMany({ where: { userId: user.id } });
    await tx.userProfile.upsert({ where: { userId: user.id }, update: createIncompleteProfileDefaults(), create: { userId: user.id, ...createIncompleteProfileDefaults() } });
  });
  return ok({ cleared: true, accountPreserved: true, onboardingCompleted: false });
}
