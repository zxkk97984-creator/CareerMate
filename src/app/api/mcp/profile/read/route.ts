import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { profileDto } from "@/lib/dto";
import { isPluginAuthorized } from "@/lib/plugin-auth";
import { getPrisma } from "@/lib/prisma";

const schema = z.object({ userId: z.string() });

export async function POST(request: Request) {
  if (!isPluginAuthorized(request)) return fail("FORBIDDEN", "插件调用令牌无效", 403);
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return fail("VALIDATION_ERROR", "画像读取参数不合法", 400, parsed.error.flatten());

  const profile = await getPrisma().userProfile.findUnique({ where: { userId: parsed.data.userId } });
  if (!profile) return fail("NOT_FOUND", "画像不存在", 404);
  return ok({ profileSummary: profileDto(profile) });
}
