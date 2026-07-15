import { requireCurrentUser } from "@/lib/auth";
import { fail, ok } from "@/lib/api";
import { createMemoryProposalService } from "@/lib/memory/proposal-service";
import { z } from "zod";

const decisionSchema = z.object({
  action: z.enum(["accept", "reject", "edit"]),
  content: z.string().trim().min(1).max(2000).optional(),
}).strict();

// ── POST /api/memory/:id/decision ──────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录", 401);

  const { id: memoryId } = await params;
  const body = await request.json().catch(() => ({}));
  const input = decisionSchema.safeParse(body);
  if (!input.success) return fail("INVALID_PARAMS", "参数不合法", 400);

  const service = createMemoryProposalService();

  if (input.data.action === "edit") {
    if (!input.data.content) return fail("INVALID_PARAMS", "编辑需要提供新内容", 400);
    await service.editProposal(memoryId, user.id, input.data.content);
    return ok({ edited: true, memoryId });
  }

  if (input.data.action === "accept") {
    await service.acceptProposal(memoryId, user.id);
    return ok({ accepted: true, memoryId });
  }

  // reject
  await service.rejectProposal(memoryId, user.id);
  return ok({ rejected: true, memoryId });
}
