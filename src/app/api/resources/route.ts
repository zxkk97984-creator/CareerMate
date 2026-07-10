import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { isAllowedResourceSource } from "@/lib/resources";
import { resourceTypes, supportedRoleKeys } from "@/lib/types";

const querySchema = z.object({
  roleKey: z.enum(supportedRoleKeys).optional(),
  abilityKey: z.enum([
    "aiTooling",
    "roleFoundation",
    "dataAnalysis",
    "businessProduct",
    "communication",
    "projectPractice",
  ]).optional(),
  type: z.enum(resourceTypes).optional(),
}).strict();

export async function GET(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const url = new URL(request.url);
  if (["roleKey", "abilityKey", "type"].some((key) => url.searchParams.getAll(key).length > 1)) {
    return fail("INVALID_REQUEST", "资源筛选参数不能重复", 400);
  }
  const parsed = querySchema.safeParse({
    roleKey: url.searchParams.get("roleKey") ?? undefined,
    abilityKey: url.searchParams.get("abilityKey") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
  });
  if (!parsed.success) return fail("INVALID_REQUEST", "资源筛选参数无效", 400, parsed.error.flatten());

  const items = await getPrisma().resourceItem.findMany({
    where: parsed.data,
    orderBy: [{ roleKey: "asc" }, { stage: "asc" }],
  });

  return ok({ items: items.filter((item) => isAllowedResourceSource(item.source)) });
}
