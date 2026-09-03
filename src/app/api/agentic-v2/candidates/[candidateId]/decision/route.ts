import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { resolveAgentArtifactCandidate, AgentArtifactCandidateResolutionError } from "@/lib/agentic-v2/candidate-resolution";

const decisionSchema = z.object({
  decision: z.enum(["accept", "reject"]),
}).strict();

type RouteContext = { params: Promise<{ candidateId: string }> };

export async function POST(
  request: Request,
  context: RouteContext,
) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const { candidateId } = await context.params;

  const parsed = decisionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "请提供有效的决定 (accept 或 reject)", 400);
  }

  try {
    const result = await resolveAgentArtifactCandidate({
      userId: user.id,
      candidateId,
      decision: parsed.data.decision,
    });

    return ok(result);
  } catch (err) {
    if (err instanceof AgentArtifactCandidateResolutionError) {
      return fail(err.code, err.message, err.status);
    }
    throw err;
  }
}
