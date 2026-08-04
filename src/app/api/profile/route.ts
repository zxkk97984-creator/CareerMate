import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { profileDto } from "@/lib/dto";
import { getPrisma } from "@/lib/prisma";
import { mutateUserProfile } from "@/lib/profile/profile-mutation-service";
import type { ProfilePatch } from "@/lib/profile/profile-patch";

const profilePatchSchema = z.object({
  educationStage: z.string().optional(),
  major: z.string().optional(),
  targetRole: z.string().optional(),
  targetRoleLabel: z.string().optional(),
  weeklyAvailableHours: z.number().min(1).max(40).optional(),
  learningPreference: z.array(z.string()).optional(),
  experienceSummary: z.string().optional(),
  interestTags: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
  memoryEnabled: z.boolean().optional(),
});

export async function GET() {
  const user = await requireCurrentUser().catch(() => null);
  if (!user?.profile) return fail("UNAUTHORIZED", "未登录或缺少画像", 401);
  return ok({ profile: profileDto(user.profile) });
}

export async function PATCH(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user?.profile) return fail("UNAUTHORIZED", "未登录或缺少画像", 401);

  const parsed = profilePatchSchema.safeParse(await request.json());
  if (!parsed.success) return fail("VALIDATION_ERROR", "画像参数不合法", 400, parsed.error.flatten());

  const data = parsed.data;
  // 通过统一画像修改服务写入，自动递增 version
  const patch: ProfilePatch = {};
  if (data.educationStage !== undefined) patch.educationStage = data.educationStage;
  if (data.major !== undefined) patch.major = data.major;
  if (data.targetRole !== undefined) patch.targetRole = { key: data.targetRole, label: data.targetRoleLabel ?? data.targetRole };
  if (data.targetRoleLabel !== undefined && data.targetRole === undefined) {
    // 仅更新 label：当前无 targetRole 时不能写入空 key
    if (!user.profile.targetRole) {
      return fail("VALIDATION_ERROR", "未设置目标岗位，请先选择目标岗位", 400);
    }
    patch.targetRole = { key: user.profile.targetRole, label: data.targetRoleLabel };
  }
  if (data.weeklyAvailableHours !== undefined) patch.weeklyAvailableHours = data.weeklyAvailableHours;
  if (data.learningPreference !== undefined) patch.learningPreference = data.learningPreference;
  if (data.experienceSummary !== undefined) patch.experienceSummary = data.experienceSummary;
  if (data.interestTags !== undefined) patch.interestTags = data.interestTags;
  if (data.constraints !== undefined) patch.constraints = data.constraints;

  const { version } = await mutateUserProfile(user.id, patch);

  // memoryEnabled 不通过 ProfilePatch 更新（非画像字段）
  if (data.memoryEnabled !== undefined) {
    await getPrisma().userProfile.update({
      where: { userId: user.id },
      data: { memoryEnabled: data.memoryEnabled },
    });
  }

  await getPrisma().progressLog.create({
    data: {
      userId: user.id,
      eventType: "profile_updated",
      title: "更新职业画像",
      summary: `用户手动调整了画像信息（版本 ${version}）。`,
    },
  });

  // 重新读取完整画像
  const updated = await getPrisma().userProfile.findUnique({ where: { userId: user.id } });
  if (!updated) return fail("PROFILE_NOT_FOUND", "画像不存在", 404);
  return ok({ profile: profileDto(updated) });
}
