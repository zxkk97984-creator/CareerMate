import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { serializePlan } from "@/lib/career";
import { planDto, profileDto } from "@/lib/dto";
import { getPrisma } from "@/lib/prisma";
import { generatePlanWithTbox, planGenerationNote } from "@/lib/tbox";
const roleKeySchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9_:-]+$/i);

const generatePlanBodySchema = z.object({
  targetRole: roleKeySchema.optional(),
  regenerate: z.boolean().optional(),
}).strict();

class PlanConflictError extends Error {}

function isDatabaseConflict(error: unknown) {
  if (error instanceof PlanConflictError) return true;
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return ["P1008", "P2034"].includes(String(error.code));
}

async function readBody(request?: Request) {
  if (!request) return {};
  const text = await request.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as unknown;
}

export async function POST(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user?.profile) return fail("UNAUTHORIZED", "未登录或缺少画像", 401);

  let rawBody: unknown;
  try {
    rawBody = await readBody(request);
  } catch {
    return fail("INVALID_REQUEST", "请求体必须是有效 JSON", 400);
  }
  const parsedBody = generatePlanBodySchema.safeParse(rawBody);
  if (!parsedBody.success) return fail("INVALID_REQUEST", "生成参数无效", 400, parsedBody.error.flatten());
  if (parsedBody.data.targetRole && parsedBody.data.targetRole !== user.profile.targetRole) {
    return fail("TARGET_ROLE_MISMATCH", "目标岗位与当前画像不一致，请先确认画像变更", 409);
  }

  const profile = profileDto(user.profile);
  const targetRole = profile.targetRole;
  if (!targetRole) {
    return fail("PROFILE_INCOMPLETE", "尚未设置目标岗位，无法生成计划", 422);
  }
  const generated = await generatePlanWithTbox(profile);
  const note = planGenerationNote(generated.meta);

  try {
    const plan = await getPrisma().$transaction(async (transaction) => {
      const latest = await transaction.careerPlan.findFirst({
        where: { userId: user.id },
        orderBy: { version: "desc" },
      });

      // 创建 pending 候选计划（不直接激活，待用户确认）
      const created = await transaction.careerPlan.create({
        data: {
          userId: user.id,
          targetRole: targetRole,
          version: (latest?.version ?? 0) + 1,
          status: "pending",
          ...serializePlan(generated.data),
          generationMeta: JSON.stringify({
            ...generated.meta,
            triggeredBy: "manual",
          }),
        },
      });

      await transaction.progressLog.create({
        data: {
          userId: user.id,
          eventType: "plan_generated",
          title: "生成职业路径",
          summary: note,
          relatedPlanId: created.id,
          metadata: JSON.stringify(generated.meta),
        },
      });
      return created;
    });

    return ok({ plan: planDto(plan), note, pendingConfirmation: true }, generated.meta as unknown as Record<string, unknown>);
  } catch (error) {
    if (isDatabaseConflict(error)) return fail("PLAN_CONFLICT", "职业路径正在更新，请刷新后重试", 409);
    return fail("PLAN_GENERATION_FAILED", "职业路径保存失败，原计划保持不变", 500);
  }
}
