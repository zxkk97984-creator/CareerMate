import { requireCurrentUser } from "@/lib/auth";
import { fail, ok } from "@/lib/api";
import { createChatService, ServiceError } from "@/lib/chat/service";
import { updateConversationInputSchema } from "@/lib/chat/schemas";

// ── GET /api/chat/conversations/:id ────────────────────────
// 获取单个会话详情（仅当前用户拥有且非deleted）

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser().catch(() => null);
    if (!user) return fail("UNAUTHORIZED", "未登录或登录态已过期", 401);

    const { id } = await params;
    const service = createChatService();
    const conversation = await service.getConversation(id, user.id);

    if (!conversation) return fail("NOT_FOUND", "会话不存在", 404);

    return ok(conversation);
  } catch (err) {
    if (err instanceof ServiceError) {
      return fail(err.code, err.message, err.status);
    }
    console.error("get conversation error", err);
    return fail("INTERNAL", "获取会话详情失败", 500);
  }
}

// ── PATCH /api/chat/conversations/:id ──────────────────────
// 重命名会话标题（1-60字符）

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser().catch(() => null);
    if (!user) return fail("UNAUTHORIZED", "未登录或登录态已过期", 401);

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const input = updateConversationInputSchema.safeParse(body);
    if (!input.success) {
      return fail("INVALID_PARAMS", "请求参数不合法", 400, input.error.flatten());
    }

    const service = createChatService();
    const conversation = await service.updateConversation(id, user.id, input.data.title);

    return ok(conversation);
  } catch (err) {
    if (err instanceof ServiceError) {
      return fail(err.code, err.message, err.status);
    }
    console.error("update conversation error", err);
    return fail("INTERNAL", "更新会话失败", 500);
  }
}

// ── DELETE /api/chat/conversations/:id ─────────────────────
// 软删除：将status设为deleted

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser().catch(() => null);
    if (!user) return fail("UNAUTHORIZED", "未登录或登录态已过期", 401);

    const { id } = await params;
    const service = createChatService();
    const conversation = await service.deleteConversation(id, user.id);

    return ok(conversation);
  } catch (err) {
    if (err instanceof ServiceError) {
      return fail(err.code, err.message, err.status);
    }
    console.error("delete conversation error", err);
    return fail("INTERNAL", "删除会话失败", 500);
  }
}
