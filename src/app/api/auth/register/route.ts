import bcrypt from "bcryptjs";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { setSession } from "@/lib/auth";
import { userDto } from "@/lib/dto";
import { getPrisma } from "@/lib/prisma";
import { createIncompleteProfileDefaults } from "@/lib/profile-defaults";

const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().min(1).max(32),
  password: z.string().min(6),
});

export async function POST(request: Request) {
  const parsed = registerSchema.safeParse(await request.json());
  if (!parsed.success) return fail("VALIDATION_ERROR", "注册参数不合法", 400, parsed.error.flatten());

  const exists = await getPrisma().user.findUnique({ where: { username: parsed.data.username } });
  if (exists) return fail("VALIDATION_ERROR", "用户名已存在", 400);

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await getPrisma().user.create({
    data: {
      username: parsed.data.username,
      displayName: parsed.data.displayName,
      passwordHash,
      profile: {
        create: createIncompleteProfileDefaults(),
      },
    },
  });

  await setSession(user.id);
  return ok({ user: userDto(user), nextPath: "/onboarding" });
}
