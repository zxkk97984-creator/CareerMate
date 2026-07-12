import { fail, ok } from "@/lib/api";
import { roleDraftContentSchema, roleDraftValidation } from "@/lib/admin-role-draft";
import { requireAdmin } from "@/lib/auth";
import { parseJson, toJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return fail("FORBIDDEN", "需要管理员权限", 403);
  const { id } = await context.params;
  const result = await getPrisma().$transaction(async (transaction) => {
    const draft = await transaction.roleDraft.findUnique({ where: { id } });
    if (!draft) return { kind: "error" as const, response: fail("NOT_FOUND", "岗位草稿不存在", 404) };
    if (draft.status === "rejected") return { kind: "error" as const, response: fail("ALREADY_REJECTED", "已拒绝的草稿不能通过", 409) };
    const content = parseJson<unknown>(draft.content, {});
    const validation = roleDraftValidation(content);
    const parsed = roleDraftContentSchema.safeParse(content);
    if (!parsed.success) {
      return { kind: "error" as const, response: fail("DRAFT_INVALID", "岗位草稿结构校验失败", 422, validation.issues) };
    }
    const plan = {
      roleName: draft.roleName,
      category: draft.category,
      targetAudience: toJson(parsed.data.targetAudience),
      entryRequirements: toJson(parsed.data.entryRequirements),
      coreWork: toJson(parsed.data.coreWork),
      abilityWeights: toJson(parsed.data.abilityWeights),
      sources: toJson(parsed.data.sources),
    };
    const template = await transaction.roleTemplate.upsert({
      where: { roleKey: draft.roleKey },
      update: plan,
      create: { roleKey: draft.roleKey, ...plan },
    });
    const alreadyApproved = draft.status === "approved";
    const updated = alreadyApproved ? draft : await transaction.roleDraft.update({
      where: { id },
      data: { status: "approved", reviewerId: admin.id, reviewNote: "结构校验通过并入库" },
    });
    if (draft.sourceReportId && !alreadyApproved) {
      await transaction.careerExplorationReport.update({
        where: { id: draft.sourceReportId },
        data: { status: "approved" },
      });
    }
    return { kind: "success" as const, data: { draft: updated, template, validation, alreadyApproved } };
  });
  if (result.kind === "error") return result.response;
  return ok(result.data);
}
