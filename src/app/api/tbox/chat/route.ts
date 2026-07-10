import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { getTboxConfig } from "@/lib/env";
import { toJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";
import { chatWithTbox } from "@/lib/tbox/adapter";
import { chatInputSchema } from "@/lib/tbox/schemas";

export async function POST(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const parsed = chatInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "对话参数不合法", 400);

  const result = await chatWithTbox(
    {
      question: parsed.data.question,
      userId: user.id,
      conversationId: parsed.data.conversationId,
      context: parsed.data.context,
    },
    { config: getTboxConfig() },
  );

  await getPrisma().progressLog.create({
    data: {
      userId: user.id,
      eventType: "chat",
      title: "与 CareerMate 对话",
      summary: parsed.data.question.slice(0, 120),
      metadata: toJson(result.meta),
    },
  });

  return ok(result.data, result.meta as unknown as Record<string, unknown>);
}
