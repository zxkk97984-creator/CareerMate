import bcrypt from "bcryptjs";
import { z } from "zod";
import { fail, ok, parseBodyJson, RequestBodyError } from "@/lib/api";
import { setSession } from "@/lib/auth";
import { userDto } from "@/lib/dto";
import { getPrisma } from "@/lib/prisma";
import { onboardingDestination } from "@/lib/onboarding-routing";

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await parseBodyJson(request);
  } catch (caught) {
    if (caught instanceof RequestBodyError) {
      return fail(caught.code, caught.message, caught.status);
    }
    throw caught;
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_ERROR", "登录参数不合法", 400, parsed.error.flatten());

  const user = await getPrisma().user.findUnique({
    where: { username: parsed.data.username },
    include: { profile: true },
  });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return fail("UNAUTHORIZED", "账号或密码错误", 401);
  }

  await setSession(user.id);
  return ok({ user: userDto(user), nextPath: onboardingDestination(user.profile) });
}
