import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { z } from "zod";

const querySchema = z.object({
  status: z.enum(["pending", "accepted", "rejected", "applying"]).optional(),
  candidateType: z.string().optional(),
  // T21b：分页——有上限的 limit + 稳定游标（createdAt,id 排序锚点）
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export async function GET(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    status: searchParams.get("status") ?? undefined,
    candidateType: searchParams.get("candidateType") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success) return fail("INVALID_QUERY", "查询参数无效", 400);

  const where: Record<string, unknown> = { userId: user.id };
  if (parsed.data.status) where.status = parsed.data.status;
  if (parsed.data.candidateType) where.candidateType = parsed.data.candidateType;

  const db = getPrisma();
  // total：匹配（含用户隔离）的真实总数，客户端计数不得用当前页长度冒充（T21b）
  const total = await db.agentArtifactCandidate.count({ where });

  const take = parsed.data.limit + 1; // 多取一条判断是否还有下一页
  const candidates = await db.agentArtifactCandidate.findMany({
    where: {
      ...where,
      ...(parsed.data.cursor ? { createdAt: { lt: new Date(cursorToMs(parsed.data.cursor)) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      candidateType: true,
      status: true,
      baseVersion: true,
      sourceSessionId: true,
      sourceConversationId: true,
      createdAt: true,
      resolvedAt: true,
    },
  });

  const hasMore = candidates.length > parsed.data.limit;
  const items = candidates.slice(0, parsed.data.limit);
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.createdAt : null;

  return ok({ items, total, nextCursor });
}

/** 游标用 createdAt 毫秒数；非法值回退为“当前时间”不报错（客户端服务端都宽容）。 */
function cursorToMs(cursor: string): number {
  const ms = Number(cursor);
  return Number.isFinite(ms) ? ms : Date.now();
}
