import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { buildRoleDraftContent, roleDraftValidation, roleKeyFromName } from "@/lib/admin-role-draft";
import { requireAdmin } from "@/lib/auth";
import { getTboxConfig } from "@/lib/env";
import { toJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";

const schema = z.object({ roleName: z.string().trim().min(2).max(80), category: z.string().trim().min(2).max(80), sourceNotes: z.string().trim().min(2).max(2_000) }).strict();

export async function POST(request: Request) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return fail("FORBIDDEN", "需要管理员权限", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("VALIDATION_ERROR", "岗位生成参数不合法", 400, parsed.error.flatten());
  const sources = parsed.data.sourceNotes.split(/\r?\n|；|;/).map((item) => item.trim()).filter(Boolean);
  const content = buildRoleDraftContent(parsed.data.roleName, sources);
  const validation = roleDraftValidation(content);
  if (!validation.valid) return fail("DRAFT_INVALID", "岗位草稿结构校验失败", 422, validation.issues);
  const config = getTboxConfig();
  const draft = await getPrisma().roleDraft.create({ data: {
    roleKey: roleKeyFromName(parsed.data.roleName), roleName: parsed.data.roleName,
    category: parsed.data.category, content: toJson(content), status: "pending",
  } });
  const meta = { requestedMode: config.mode, actualMode: "manual", degraded: config.mode !== "manual", fallbackReason: config.mode === "manual" ? null : "岗位草稿使用可审核的结构化人工模板", source: "manual-admin-fixture" };
  return ok({ draft, content, validation }, meta);
}
