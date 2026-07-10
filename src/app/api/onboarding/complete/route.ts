import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { profileDto } from "@/lib/dto";
import { parseJson, toJson } from "@/lib/json";
import { calculateOnboardingCompleteness, onboardingDraftSchema } from "@/lib/onboarding";
import { getPrisma } from "@/lib/prisma";

const completeOnboardingSchema = z.object({
  conversationId: z.string().trim().min(1).max(100),
});

export async function POST(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const parsed = completeOnboardingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "完成画像参数不合法", 400, parsed.error.flatten());

  const prisma = getPrisma();
  const conversation = await prisma.onboardingConversation.findUnique({
    where: { id: parsed.data.conversationId },
  });
  if (!conversation || conversation.userId !== user.id) {
    return fail("CONVERSATION_NOT_FOUND", "画像对话不存在", 404);
  }

  if (conversation.status === "completed") {
    const completedProfile = await prisma.userProfile.findUnique({ where: { userId: user.id } });
    if (!completedProfile?.onboardingCompleted) {
      return fail("PROFILE_NOT_COMPLETED", "画像对话状态与用户画像不一致", 409);
    }
    return ok({ profile: profileDto(completedProfile), alreadyCompleted: true });
  }
  if (conversation.status !== "active") {
    return fail("CONVERSATION_NOT_ACTIVE", "画像对话当前不可完成", 409);
  }

  const draftResult = onboardingDraftSchema.safeParse(parseJson<unknown>(conversation.draft, null));
  if (!draftResult.success) {
    return fail("INVALID_STORED_DRAFT", "服务端画像草稿不合法，请继续对话后重试", 409);
  }
  const completeness = calculateOnboardingCompleteness(draftResult.data);
  if (conversation.completeness < 0.8 || completeness < 0.8) {
    return fail("PROFILE_INCOMPLETE", "画像完整度至少需要达到 80%", 409, { profileCompleteness: completeness });
  }
  if (!user.profile) return fail("PROFILE_NOT_FOUND", "用户画像不存在", 409);

  const draft = draftResult.data;
  const existing = user.profile;
  const updatedProfile = await prisma.$transaction(async (transaction) => {
    const profile = await transaction.userProfile.update({
      where: { userId: user.id },
      data: {
        educationStage: draft.educationStage ?? existing.educationStage,
        major: draft.major ?? existing.major,
        targetRole: draft.targetRole ?? existing.targetRole,
        targetRoleLabel: draft.targetRoleLabel ?? existing.targetRoleLabel,
        weeklyAvailableHours: draft.weeklyAvailableHours ?? existing.weeklyAvailableHours,
        learningPreference: toJson(
          draft.learningPreference ?? parseJson<string[]>(existing.learningPreference, []),
        ),
        experienceSummary: draft.experienceSummary ?? existing.experienceSummary,
        constraints: toJson(draft.constraints ?? parseJson<string[]>(existing.constraints, [])),
        onboardingCompleted: true,
      },
    });
    await transaction.onboardingConversation.update({
      where: { id: conversation.id },
      data: { status: "completed" },
    });
    await transaction.progressLog.create({
      data: {
        userId: user.id,
        eventType: "onboarding_completed",
        title: "完成职业画像引导",
        summary: `画像完整度 ${Math.round(completeness * 100)}%，目标岗位为 ${profile.targetRoleLabel}。`,
        metadata: toJson({ conversationId: conversation.id, completeness }),
      },
    });
    return profile;
  });

  return ok({ profile: profileDto(updatedProfile), alreadyCompleted: false });
}
