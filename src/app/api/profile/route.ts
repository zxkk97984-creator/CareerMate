import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { profileDto } from "@/lib/dto";
import { toJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";

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
  const updated = await getPrisma().userProfile.update({
    where: { userId: user.id },
    data: {
      educationStage: data.educationStage,
      major: data.major,
      targetRole: data.targetRole,
      targetRoleLabel: data.targetRoleLabel,
      weeklyAvailableHours: data.weeklyAvailableHours,
      learningPreference: data.learningPreference ? toJson(data.learningPreference) : undefined,
      experienceSummary: data.experienceSummary,
      interestTags: data.interestTags ? toJson(data.interestTags) : undefined,
      constraints: data.constraints ? toJson(data.constraints) : undefined,
      memoryEnabled: data.memoryEnabled,
    },
  });

  await getPrisma().progressLog.create({
    data: {
      userId: user.id,
      eventType: "profile_updated",
      title: "更新职业画像",
      summary: "用户手动调整了画像信息。",
    },
  });

  return ok({ profile: profileDto(updated) });
}
