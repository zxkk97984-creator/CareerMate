import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { resourceDto } from "@/lib/dto";
import { getPrisma } from "@/lib/prisma";
import { isAllowedResourceSource } from "@/lib/resources";

export async function GET(
  _request: Request,
  context: { params: Promise<{ resourceId: string }> },
) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const { resourceId } = await context.params;
  const resource = await getPrisma().resourceItem.findUnique({ where: { id: resourceId } });
  if (!resource || resource.status !== "active" || !isAllowedResourceSource(resource.source)) {
    return fail("NOT_FOUND", "资源不存在或不可访问", 404);
  }

  return ok({ resource: resourceDto(resource) });
}
