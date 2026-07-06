import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

const postSchema = z.object({
  content: z.string().min(1),
  sensitivity: z.enum(["normal", "sensitive"]).default("normal"),
});

const patchSchema = z.object({
  id: z.string(),
  content: z.string().min(1),
});

export async function GET() {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const items = await getPrisma().memoryItem.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return ok({ items });
}

export async function POST(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user?.profile) return fail("UNAUTHORIZED", "未登录或缺少画像", 401);
  if (!user.profile.memoryEnabled) return fail("MEMORY_DISABLED", "长期记忆已关闭", 409);

  const parsed = postSchema.safeParse(await request.json());
  if (!parsed.success) return fail("VALIDATION_ERROR", "记忆参数不合法", 400, parsed.error.flatten());

  const memory = await getPrisma().memoryItem.create({
    data: {
      userId: user.id,
      source: "manual",
      content: parsed.data.content,
      sensitivity: parsed.data.sensitivity,
    },
  });

  return ok({ memory });
}

export async function PATCH(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return fail("VALIDATION_ERROR", "记忆参数不合法", 400, parsed.error.flatten());

  const memory = await getPrisma().memoryItem.update({
    where: { id: parsed.data.id, userId: user.id },
    data: { content: parsed.data.content },
  });

  return ok({ memory });
}

export async function DELETE(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return fail("VALIDATION_ERROR", "缺少记忆 ID", 400);

  await getPrisma().memoryItem.delete({ where: { id, userId: user.id } });
  return ok({ deleted: true });
}
