import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { createExplorationService } from "@/lib/careers/exploration-service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const { id } = await params;
  const svc = createExplorationService();

  try {
    const result = await svc.submitForReview(id, user.id);
    return ok(result);
  } catch (err) {
    if (err instanceof Error && "code" in err && "status" in err) {
      const svcErr = err as { code: string; message: string; status: number };
      return fail(svcErr.code, svcErr.message, svcErr.status);
    }
    throw err;
  }
}
