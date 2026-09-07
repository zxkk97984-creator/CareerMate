import { z } from "zod";
import { fail, ok, parseBodyJson, RequestBodyError } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { userDto } from "@/lib/dto";
import { MAX_AVATAR_DATA_URL_LENGTH } from "@/lib/account";
import { getPrisma } from "@/lib/prisma";

const AVATAR_DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/;

const accountSchema = z
  .object({
    displayName: z.string().trim().min(1).max(32).optional(),
    avatarDataUrl: z
      .union([z.string().max(MAX_AVATAR_DATA_URL_LENGTH), z.null()])
      .optional(),
  })
  .strict()
  .refine((v) => v.displayName !== undefined || v.avatarDataUrl !== undefined, {
    message: "至少需要更新一项账号信息",
  });

export async function PATCH(request: Request) {
  const current = await requireCurrentUser().catch(() => null);
  if (!current) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  let body: unknown;
  try {
    body = await parseBodyJson(request, MAX_AVATAR_DATA_URL_LENGTH + 128 * 1024);
  } catch (caught) {
    if (caught instanceof RequestBodyError) {
      return fail(caught.code, caught.message, caught.status);
    }
    throw caught;
  }

  const parsed = accountSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_ERROR", "账号参数不合法", 400, parsed.error.flatten());
  if (parsed.data.avatarDataUrl && !AVATAR_DATA_URL_PATTERN.test(parsed.data.avatarDataUrl)) {
    return fail("VALIDATION_ERROR", "头像不是支持的图片格式，请上传 PNG/JPEG/WebP/GIF", 400);
  }

  const updated = await getPrisma().user.update({
    where: { id: current.id },
    data: {
      ...(parsed.data.displayName !== undefined ? { displayName: parsed.data.displayName } : {}),
      ...(parsed.data.avatarDataUrl !== undefined ? { avatarDataUrl: parsed.data.avatarDataUrl } : {}),
    },
  });

  return ok({ user: userDto(updated) });
}
