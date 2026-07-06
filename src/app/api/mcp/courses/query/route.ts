import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { isPluginAuthorized } from "@/lib/plugin-auth";
import { getPrisma } from "@/lib/prisma";

const schema = z.object({
  role: z.string().optional(),
  stage: z.string().optional(),
  abilityGap: z.string().optional(),
  limit: z.number().min(1).max(20).default(5),
});

export async function POST(request: Request) {
  if (!isPluginAuthorized(request)) return fail("FORBIDDEN", "插件调用令牌无效", 403);
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return fail("VALIDATION_ERROR", "课程查询参数不合法", 400, parsed.error.flatten());

  const items = await getPrisma().resourceItem.findMany({
    where: {
      roleKey: parsed.data.role,
      stage: parsed.data.stage,
      abilityKey: parsed.data.abilityGap,
    },
    take: parsed.data.limit,
  });
  return ok({ items });
}
