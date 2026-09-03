import { requireCurrentUser } from "@/lib/auth";
import { fail, ok } from "@/lib/api";
import { createChatService, ServiceError } from "@/lib/chat/service";
import { listMessagesQuerySchema } from "@/lib/chat/schemas";

// ── GET /api/chat/conversations/:id/messages ───────────────
// 返回会话消息历史（按创建时间升序），支持before游标分页

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser().catch(() => null);
    if (!user) return fail("UNAUTHORIZED", "未登录或登录态已过期", 401);

    const { id } = await params;
    const url = new URL(request.url);
    const query = listMessagesQuerySchema.safeParse({
      before: url.searchParams.get("before") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    });
    if (!query.success) {
      return fail("INVALID_PARAMS", "查询参数不合法", 400, query.error.flatten());
    }

    const service = createChatService();
    const messages = await service.getMessages(
      id,
      user.id,
      query.data.before,
      query.data.limit,
    );

    return ok(messages);
  } catch (err) {
    if (err instanceof ServiceError) {
      return fail(err.code, err.message, err.status);
    }
    console.error("list messages error", err);
    return fail("INTERNAL", "获取消息列表失败", 500);
  }
}
