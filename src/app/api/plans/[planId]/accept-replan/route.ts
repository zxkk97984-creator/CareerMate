import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { createReplanService } from "@/lib/plans/replan-service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const { planId } = await params;
  const svc = createReplanService();

  try {
    const result = await svc.acceptReplan(planId, user.id);
    return ok({
      old: result.old,
      new: result.new,
      diff: result.diff,
    });
  } catch (err) {
    if (err instanceof Error && "code" in err && "status" in err) {
      const svcErr = err as { code: string; message: string; status: number };
      return fail(svcErr.code, svcErr.message, svcErr.status);
    }
    throw err;
  }
}
