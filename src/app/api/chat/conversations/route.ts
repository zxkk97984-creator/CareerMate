import { requireCurrentUser } from "@/lib/auth";
import { fail, ok } from "@/lib/api";
import { createChatService, ServiceError } from "@/lib/chat/service";
import {
  createConversationInputSchema,
  listConversationsQuerySchema,
} from "@/lib/chat/schemas";

// ── GET /api/chat/conversations ────────────────────────────
// 返回当前用户非deleted的会话列表，按lastMessageAt降序，支持cursor分页

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser().catch(() => null);
    if (!user) return fail("UNAUTHORIZED", "未登录或登录态已过期", 401);

    const url = new URL(request.url);
    const query = listConversationsQuerySchema.safeParse({
      cursor: url.searchParams.get("cursor") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    });
    if (!query.success) {
      return fail("INVALID_PARAMS", "查询参数不合法", 400, query.error.flatten());
    }

    const service = createChatService();
    const result = await service.listConversations(
      user.id,
      query.data.cursor,
      query.data.limit,
    );

    return ok({
      items: result.items,
      nextCursor: result.nextCursor,
    });
  } catch (err) {
    if (err instanceof ServiceError) {
      return fail(err.code, err.message, err.status);
    }
    console.error("list conversations error", err);
    return fail("INTERNAL", "获取会话列表失败", 500);
  }
}

// ── POST /api/chat/conversations ───────────────────────────
// 创建新会话，可选title，默认为"新对话"

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser().catch(() => null);
    if (!user) return fail("UNAUTHORIZED", "未登录或登录态已过期", 401);

    const body = await request.json().catch(() => ({}));
    const input = createConversationInputSchema.safeParse(body);
    if (!input.success) {
      return fail("INVALID_PARAMS", "请求参数不合法", 400, input.error.flatten());
    }

    const service = createChatService();
    const conversation = await service.createConversation(user.id, input.data.title);

    return ok(conversation);
  } catch (err) {
    if (err instanceof ServiceError) {
      return fail(err.code, err.message, err.status);
    }
    console.error("create conversation error", err);
    return fail("INTERNAL", "创建会话失败", 500);
  }
}
