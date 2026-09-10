import { requireCurrentUser } from "@/lib/auth";
import { fail } from "@/lib/api";
import { sendSimulationAnswer } from "@/lib/simulation/messages-service";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或缺少画像", 401);
  return sendSimulationAnswer(request, user, (await context.params).sessionId);
}
