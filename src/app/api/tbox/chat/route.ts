/**
 * @deprecated 仅限管理员测试/诊断专用。产品聊天请使用 /api/chat/conversations/[id]/stream。
 * 普通用户调用返回 403。
 */
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prepareCareerChat } from "@/lib/chat/server";
import { getTboxConfig } from "@/lib/env";
import { toJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";
import { chatWithTbox } from "@/lib/tbox/adapter";
import { chatInputSchema } from "@/lib/tbox/schemas";

export async function POST(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);
  if (user.role !== "admin") return fail("FORBIDDEN", "该诊断接口仅限管理员使用", 403);

  const parsed = chatInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "对话参数不合法", 400);
  const prepared = await prepareCareerChat({
    userId: user.id,
    question: parsed.data.question,
  });

  const result = await chatWithTbox(
    {
      question: prepared.enhancedQuestion,
      userId: user.id,
      conversationId: parsed.data.conversationId,
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
