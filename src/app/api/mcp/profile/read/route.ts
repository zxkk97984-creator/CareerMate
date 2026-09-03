import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { profileDto } from "@/lib/dto";
import { requirePluginScope } from "@/lib/plugin-auth";
import { getPrisma } from "@/lib/prisma";

const schema = z.object({ userId: z.string() });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return fail("VALIDATION_ERROR", "画像读取参数不合法", 400, parsed.error.flatten());
  const principal = requirePluginScope(request, "profile:read", parsed.data.userId);
  if (!principal) return fail("FORBIDDEN", "插件用户绑定或权限不匹配", 403);

  const profile = await getPrisma().userProfile.findUnique({ where: { userId: principal.userId } });
  if (!profile) return fail("NOT_FOUND", "画像不存在", 404);
  return ok({ profileSummary: profileDto(profile) });
}
