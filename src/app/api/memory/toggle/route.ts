import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

const schema = z.object({ enabled: z.boolean() }).strict();

export async function POST(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user?.profile) return fail("UNAUTHORIZED", "未登录或缺少画像", 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("VALIDATION_ERROR", "开关参数不合法", 400);
  const profile = await getPrisma().userProfile.update({ where: { userId: user.id }, data: { memoryEnabled: parsed.data.enabled } });
  return ok({ enabled: profile.memoryEnabled });
}
