import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { createAgentArtifactCandidateService } from "@/lib/agentic-v2/candidate-service";
import { getPrisma } from "@/lib/prisma";
import {
  createTaskResourceAssociation,
  ResourceAssociationError,
} from "@/lib/plans/resource-association";

const paramsSchema = z.object({
  planId: z.string().min(1).max(200),
  taskId: z.string().min(1).max(200),
});
const bodySchema = z.object({ resourceId: z.string().min(1).max(200) }).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ planId: string; taskId: string }> },
) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const params = paramsSchema.safeParse(await context.params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) {
    return fail("INVALID_INPUT", "资源关联参数无效", 400);
  }

  try {
    const prisma = getPrisma();
    const result = await createTaskResourceAssociation({
      userId: user.id,
      planId: params.data.planId,
      taskId: params.data.taskId,
      resourceId: body.data.resourceId,
    }, {
      db: prisma as never,
      candidateService: createAgentArtifactCandidateService({ db: prisma as never }),
    });
    return ok({
      ...result,
      requiresUserConfirmation: result.kind === "pending",
    });
  } catch (error) {
    if (error instanceof ResourceAssociationError) {
      return fail(error.code, error.message, error.status);
    }
    return fail("RESOURCE_ASSOCIATION_FAILED", "资源关联候选创建失败", 500);
  }
}
