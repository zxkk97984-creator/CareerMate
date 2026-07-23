import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { agentArtifactV1Schema } from "@/lib/agentic-v2/contracts";

type RouteContext = { params: Promise<{ candidateId: string }> };

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const { candidateId } = await context.params;

  const candidate = await getPrisma().agentArtifactCandidate.findFirst({
    where: { id: candidateId, userId: user.id },
  });

  if (!candidate) {
    return fail("CANDIDATE_NOT_FOUND", "候选未找到", 404);
  }

  // Zod 校验 artifact
  let artifact: unknown = null;
  try {
    const raw = JSON.parse(candidate.artifact);
    const result = agentArtifactV1Schema.safeParse(raw);
    if (!result.success) {
      return fail("CANDIDATE_CORRUPT", "候选数据不符合 schema", 500);
    }
    artifact = result.data;
  } catch {
    return fail("CANDIDATE_CORRUPT", "候选数据损坏", 500);
  }

  return ok({
    id: candidate.id,
    candidateType: candidate.candidateType,
    status: candidate.status,
    artifact,
    baseVersion: candidate.baseVersion,
    sourceSessionId: candidate.sourceSessionId,
    sourceConversationId: candidate.sourceConversationId,
    createdAt: candidate.createdAt,
    resolvedAt: candidate.resolvedAt,
  });
}
