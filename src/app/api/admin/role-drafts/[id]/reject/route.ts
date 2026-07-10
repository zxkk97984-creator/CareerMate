import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

const schema = z.object({ reason: z.string().trim().min(2).max(500) }).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return fail("FORBIDDEN", "需要管理员权限", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("VALIDATION_ERROR", "拒绝原因不能为空", 400, parsed.error.flatten());
  const { id } = await context.params;
  const changed = await getPrisma().roleDraft.updateMany({ where: { id, status: "pending" }, data: { status: "rejected", reviewerId: admin.id, reviewNote: parsed.data.reason } });
  if (changed.count !== 1) return fail("NOT_FOUND_OR_REVIEWED", "草稿不存在或已经审核", 409);
  return ok({ draft: await getPrisma().roleDraft.findUnique({ where: { id } }) });
}
