import bcrypt from "bcryptjs";
import { z } from "zod";
import { fail, ok, parseBodyJson, RequestBodyError } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(6).max(200),
  })
  .strict();

export async function POST(request: Request) {
  const current = await requireCurrentUser().catch(() => null);
  if (!current) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  let body: unknown;
  try {
    body = await parseBodyJson(request, 4 * 1024);
  } catch (caught) {
    if (caught instanceof RequestBodyError) {
      return fail(caught.code, caught.message, caught.status);
    }
    throw caught;
  }

  const parsed = passwordSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_ERROR", "密码参数不合法（新密码至少 6 位）", 400, parsed.error.flatten());
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return fail("VALIDATION_ERROR", "新密码不能与当前密码相同", 400);
  }

  const stored = await getPrisma().user.findUnique({
    where: { id: current.id },
    select: { passwordHash: true },
  });
  if (!stored) return fail("NOT_FOUND", "账号不存在", 404);

  const matches = await bcrypt.compare(parsed.data.currentPassword, stored.passwordHash);
  if (!matches) return fail("CONFIRMATION_MISMATCH", "当前密码不正确", 400);

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await getPrisma().user.update({
    where: { id: current.id },
    data: { passwordHash },
  });

  return ok({ updated: true });
}
