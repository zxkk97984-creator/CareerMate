import { requireCurrentUser } from "@/lib/auth";
import { fail } from "@/lib/api";
import { createChatService, ServiceError } from "@/lib/chat/service";
import { sendMessageInputSchema } from "@/lib/chat/schemas";
import { handleStreamRequest } from "@/lib/chat/stream-service";

// ── POST /api/chat/conversations/:id/stream ───────────────
// 发送消息并返回 SSE 流式响应
//
// 事件顺序：context → delta → ... → artifact? → done | error

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser().catch(() => null);
    if (!user) return fail("UNAUTHORIZED", "未登录或登录态已过期", 401);

    const { id: conversationId } = await params;

    // 校验会话所有权
    const service = createChatService();
    const conversation = await service.getConversation(conversationId, user.id);
    if (!conversation) return fail("NOT_FOUND", "会话不存在", 404);

    // 解析和校验输入
    const body = await request.json().catch(() => ({}));
    const input = sendMessageInputSchema.safeParse(body);
    if (!input.success) {
      return fail("INVALID_PARAMS", "请求参数不合法", 400, input.error.flatten());
    }

    // 返回 SSE 流
    return handleStreamRequest({
      userId: user.id,
      conversationId,
      message: input.data.message.trim(),
      clientRequestId: input.data.clientRequestId,
      actionId: input.data.actionId,
      interaction: input.data.interaction,
      signal: request.signal,
    }, service);
  } catch (err) {
    if (err instanceof ServiceError) {
      return fail(err.code, err.message, err.status);
    }
    console.error("stream chat error", err);
    return fail("INTERNAL", "流式对话失败", 500);
  }
}
