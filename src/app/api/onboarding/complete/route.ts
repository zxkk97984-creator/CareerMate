import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { profileDto } from "@/lib/dto";
import { parseJson, toJson } from "@/lib/json";
import { calculateOnboardingCompleteness, onboardingDraftSchema } from "@/lib/onboarding";
import { getPrisma } from "@/lib/prisma";
import { mutateUserProfile } from "@/lib/profile/profile-mutation-service";
import type { ProfilePatch } from "@/lib/profile/profile-patch";

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
  const completion = await prisma.$transaction(async (transaction) => {
    const claim = await transaction.onboardingConversation.updateMany({
      where: { id: conversation.id, userId: user.id, status: "active" },
      data: { status: "completed" },
    });
    if (claim.count === 0) {
      const profile = await transaction.userProfile.findUnique({ where: { userId: user.id } });
      return { profile, alreadyCompleted: true } as const;
    }

    // 通过统一画像修改服务写入（含 version 递增），复用当前事务 tx
    const patch: ProfilePatch = {};
    if (draft.educationStage) patch.educationStage = draft.educationStage;
    if (draft.major) patch.major = draft.major;
    if (draft.targetRole) patch.targetRole = { key: draft.targetRole, label: draft.targetRoleLabel ?? draft.targetRole };
    if (draft.weeklyAvailableHours) patch.weeklyAvailableHours = draft.weeklyAvailableHours;
    if (draft.learningPreference) patch.learningPreference = draft.learningPreference;
    if (draft.experienceSummary) patch.experienceSummary = draft.experienceSummary;
    if (draft.constraints) patch.constraints = draft.constraints;

    await mutateUserProfile(user.id, patch, undefined, transaction);

    // 单独设置 onboardingCompleted（非画像字段）
    const profile = await transaction.userProfile.update({
      where: { userId: user.id },
      data: { onboardingCompleted: true },
    });
    await transaction.progressLog.create({
      data: {
        userId: user.id,
        eventType: "onboarding_completed",
        title: "完成职业画像引导",
        summary: `画像完整度 ${Math.round(completeness * 100)}%，目标岗位为 ${profile.targetRoleLabel ?? "未设置"}。`,
        metadata: toJson({ conversationId: conversation.id, completeness }),
      },
    });
    return { profile, alreadyCompleted: false } as const;
  });

  if (!completion.profile?.onboardingCompleted) {
    return fail("PROFILE_NOT_COMPLETED", "画像对话状态与用户画像不一致", 409);
  }
  return ok({
    profile: profileDto(completion.profile),
    alreadyCompleted: completion.alreadyCompleted,
  });
}
