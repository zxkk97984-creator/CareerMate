import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { roleDraftContentSchema, roleDraftValidation } from "@/lib/admin-role-draft";
import { requireAdmin } from "@/lib/auth";
import { toJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";

const schema = z.object({ roleName: z.string().trim().min(2).max(80), category: z.string().trim().min(2).max(80), content: roleDraftContentSchema }).strict();

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return fail("FORBIDDEN", "需要管理员权限", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("VALIDATION_ERROR", "岗位草稿结构不合法", 400, parsed.error.flatten());
  const { id } = await context.params;
  const changed = await getPrisma().roleDraft.updateMany({ where: { id, status: "pending" }, data: { roleName: parsed.data.roleName, category: parsed.data.category, content: toJson(parsed.data.content) } });
  if (changed.count !== 1) return fail("NOT_FOUND_OR_REVIEWED", "草稿不存在或已经审核", 409);
  const draft = await getPrisma().roleDraft.findUnique({ where: { id } });
  return ok({ draft, content: parsed.data.content, validation: roleDraftValidation(parsed.data.content) });
}
