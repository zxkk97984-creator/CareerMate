import bcrypt from "bcryptjs";
import { z } from "zod";
import { fail, ok, parseBodyJson, RequestBodyError } from "@/lib/api";
import { setSession } from "@/lib/auth";
import { userDto } from "@/lib/dto";
import { getPrisma } from "@/lib/prisma";
import { createIncompleteProfileDefaults } from "@/lib/profile-defaults";

const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().min(1).max(32),
  password: z.string().min(6).max(200),
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

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_ERROR", "注册参数不合法", 400, parsed.error.flatten());

  const exists = await getPrisma().user.findUnique({ where: { username: parsed.data.username } });
  if (exists) return fail("VALIDATION_ERROR", "用户名已存在", 400);

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  let user;
  try {
    user = await getPrisma().user.create({
      data: {
        username: parsed.data.username,
        displayName: parsed.data.displayName,
        passwordHash,
        profile: {
          create: createIncompleteProfileDefaults(),
        },
      },
    });
  } catch (caught) {
    // T23a：注册唯一键并发竞态（两个同名并发注册）→ 稳定响应，不暴露原始异常
    if (caught && typeof caught === "object" && (caught as { code?: string }).code === "P2002") {
      return fail("VALIDATION_ERROR", "用户名已存在", 400);
    }
    throw caught;
  }

  await setSession(user.id);
  return ok({ user: userDto(user), nextPath: "/" });
}
