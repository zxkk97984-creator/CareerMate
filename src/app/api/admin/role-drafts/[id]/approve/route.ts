import { fail, ok } from "@/lib/api";
import { roleDraftContentSchema, roleDraftValidation } from "@/lib/admin-role-draft";
import { requireAdmin } from "@/lib/auth";
import { parseJson, toJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return fail("FORBIDDEN", "需要管理员权限", 403);
  const { id } = await context.params;
  const draft = await getPrisma().roleDraft.findUnique({ where: { id } });
  if (!draft) return fail("NOT_FOUND", "岗位草稿不存在", 404);
  if (draft.status === "rejected") return fail("ALREADY_REJECTED", "已拒绝的草稿不能通过", 409);
  const content = parseJson<unknown>(draft.content, {});
  const validation = roleDraftValidation(content);
  const parsed = roleDraftContentSchema.safeParse(content);
  if (!parsed.success) return fail("DRAFT_INVALID", "岗位草稿结构校验失败", 422, validation.issues);
  const template = await getPrisma().roleTemplate.upsert({ where: { roleKey: draft.roleKey }, update: {
    roleName: draft.roleName, category: draft.category, targetAudience: toJson(parsed.data.targetAudience), entryRequirements: toJson(parsed.data.entryRequirements), coreWork: toJson(parsed.data.coreWork), abilityWeights: toJson(parsed.data.abilityWeights), sources: toJson(parsed.data.sources),
  }, create: {
    roleKey: draft.roleKey, roleName: draft.roleName, category: draft.category, targetAudience: toJson(parsed.data.targetAudience), entryRequirements: toJson(parsed.data.entryRequirements), coreWork: toJson(parsed.data.coreWork), abilityWeights: toJson(parsed.data.abilityWeights), sources: toJson(parsed.data.sources),
  } });
  const alreadyApproved = draft.status === "approved";
  const updated = alreadyApproved ? draft : await getPrisma().roleDraft.update({ where: { id }, data: { status: "approved", reviewerId: admin.id, reviewNote: "结构校验通过并入库" } });
  return ok({ draft: updated, template, validation, alreadyApproved });
}
