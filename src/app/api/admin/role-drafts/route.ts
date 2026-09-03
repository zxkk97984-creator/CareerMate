import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { parseJson, toJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";

const patchSchema = z.object({
  id: z.string(),
  action: z.enum(["approve", "reject"]),
  reviewNote: z.string().optional(),
});

export async function GET() {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return fail("FORBIDDEN", "需要管理员权限", 403);

  const drafts = await getPrisma().roleDraft.findMany({ orderBy: { createdAt: "desc" } });
  const templates = await getPrisma().roleTemplate.findMany({ orderBy: { roleName: "asc" } });
  return ok({ drafts, templates });
}

export async function POST() {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return fail("FORBIDDEN", "需要管理员权限", 403);

  const draft = await getPrisma().roleDraft.create({
    data: {
      roleKey: `ai_role_${Date.now()}`,
      roleName: "AI 运营分析助理",
      category: "AI/运营/数据交叉",
      content: toJson({
        reason: "AI 辅助生成的岗位草稿，用于演示管理员审核机制。",
        entryRequirements: ["会基础办公", "能理解运营指标", "能使用 AI 工具辅助分析"],
        sources: ["人工整理公开信息", "脱敏模拟岗位要求"],
      }),
    },
  });

  return ok({ draft });
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return fail("FORBIDDEN", "需要管理员权限", 403);

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return fail("VALIDATION_ERROR", "审核参数不合法", 400, parsed.error.flatten());

  const draft = await getPrisma().roleDraft.findUnique({ where: { id: parsed.data.id } });
  if (!draft) return fail("NOT_FOUND", "岗位草稿不存在", 404);

  if (parsed.data.action === "approve") {
    const content = parseJson<Record<string, unknown>>(draft.content, {});
    await getPrisma().roleTemplate.upsert({
      where: { roleKey: draft.roleKey },
      update: {
        roleName: draft.roleName,
        category: draft.category,
        sources: toJson(content.sources ?? ["管理员审核入库"]),
      },
      create: {
        roleKey: draft.roleKey,
        roleName: draft.roleName,
        category: draft.category,
        targetAudience: toJson(["高校生", "职场新人"]),
        entryRequirements: toJson(content.entryRequirements ?? ["基础办公", "AI 工具使用"]),
        coreWork: toJson(["任务拆解", "AI 辅助产出", "复盘汇报"]),
        abilityWeights: toJson({
          aiTooling: 0.2,
          roleFoundation: 0.18,
          dataAnalysis: 0.16,
          businessProduct: 0.16,
          communication: 0.18,
          projectPractice: 0.12,
        }),
        sources: toJson(content.sources ?? ["管理员审核入库"]),
      },
    });
  }

  const updated = await getPrisma().roleDraft.update({
    where: { id: draft.id },
    data: {
      status: parsed.data.action === "approve" ? "approved" : "rejected",
      reviewerId: admin.id,
      reviewNote: parsed.data.reviewNote,
    },
  });

  return ok({ draft: updated });
}
