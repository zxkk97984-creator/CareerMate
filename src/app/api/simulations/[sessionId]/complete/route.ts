import { requireCurrentUser } from "@/lib/auth";
import { fail } from "@/lib/api";
import { completeSimulation } from "@/lib/simulation/complete-service";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user?.profile) return fail("UNAUTHORIZED", "未登录或缺少画像", 401);
  return completeSimulation(request, user, (await context.params).sessionId);
}
