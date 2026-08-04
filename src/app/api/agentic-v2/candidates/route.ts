import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { z } from "zod";

const querySchema = z.object({
  status: z.enum(["pending", "accepted", "rejected", "applying"]).optional(),
  candidateType: z.string().optional(),
});

export async function GET(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    status: searchParams.get("status") ?? undefined,
    candidateType: searchParams.get("candidateType") ?? undefined,
  });
  if (!parsed.success) return fail("INVALID_QUERY", "查询参数无效", 400);

  const where: Record<string, unknown> = { userId: user.id };
  if (parsed.data.status) where.status = parsed.data.status;
  if (parsed.data.candidateType) where.candidateType = parsed.data.candidateType;

  const candidates = await getPrisma().agentArtifactCandidate.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      candidateType: true,
      status: true,
      baseVersion: true,
      sourceSessionId: true,
      sourceConversationId: true,
      createdAt: true,
      resolvedAt: true,
    },
  });

  return ok({ items: candidates });
}
