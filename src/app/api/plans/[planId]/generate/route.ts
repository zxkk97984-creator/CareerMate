import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import {
  createPlanGenerationService,
  PlanGenerationError,
} from "@/lib/plans/generation-service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user?.profile) return fail("UNAUTHORIZED", "未登录或缺少画像", 401);
  const { planId } = await params;
  try {
    const result = await createPlanGenerationService().generate(planId, user.id);
    return ok(result, result.executionMeta as unknown as Record<string, unknown>);
  } catch (error) {
    if (error instanceof PlanGenerationError) {
      return fail(error.code, error.message, error.status);
    }
    return fail("PLAN_GENERATION_FAILED", "计划生成暂时失败，可以稍后重试", 502);
  }
}
