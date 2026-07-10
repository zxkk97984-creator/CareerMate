import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

const patchSchema = z.object({ content: z.string().trim().min(1).max(4_000), sensitivity: z.enum(["normal", "sensitive"]).optional() }).strict();

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("VALIDATION_ERROR", "记忆参数不合法", 400, parsed.error.flatten());
  const { id } = await context.params;
  const changed = await getPrisma().memoryItem.updateMany({ where: { id, userId: user.id }, data: parsed.data });
  if (changed.count !== 1) return fail("NOT_FOUND", "记忆不存在", 404);
  const memory = await getPrisma().memoryItem.findUnique({ where: { id } });
  return ok({ memory });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);
  const { id } = await context.params;
  const deleted = await getPrisma().memoryItem.deleteMany({ where: { id, userId: user.id } });
  if (deleted.count !== 1) return fail("NOT_FOUND", "记忆不存在", 404);
  return ok({ deleted: true });
}
