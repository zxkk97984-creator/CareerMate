import bcrypt from "bcryptjs";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { setSession } from "@/lib/auth";
import { userDto } from "@/lib/dto";
import { getPrisma } from "@/lib/prisma";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json());
  if (!parsed.success) return fail("VALIDATION_ERROR", "登录参数不合法", 400, parsed.error.flatten());

  const user = await getPrisma().user.findUnique({ where: { username: parsed.data.username } });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return fail("UNAUTHORIZED", "账号或密码错误", 401);
  }

  await setSession(user.id);
  return ok({ user: userDto(user) });
}
