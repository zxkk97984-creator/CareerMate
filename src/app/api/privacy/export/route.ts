import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { buildPrivacyExport } from "@/lib/privacy";
import { getPrisma } from "@/lib/prisma";

export async function GET() {
  const current = await requireCurrentUser().catch(() => null);
  if (!current) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);
  const user = await getPrisma().user.findUnique({
    where: { id: current.id },
    select: {
      id: true, username: true, displayName: true, role: true, createdAt: true, updatedAt: true,
      profile: true, memories: true, plans: true, logs: true, simulations: true,
      updateCandidates: true, onboardingConversations: true,
      chatConversations: { include: { messages: true } },
      abilityEvidence: true,
      explorationReports: true,
    },
  });
  if (!user) return fail("NOT_FOUND", "账号不存在", 404);
  const {
    profile,
    memories,
    plans,
    logs,
    simulations,
    updateCandidates,
    onboardingConversations,
    chatConversations,
    abilityEvidence,
    explorationReports,
    ...safeUser
  } = user;
  return ok(buildPrivacyExport({
    user: safeUser,
    profile,
    memories,
    plans,
    logs,
    simulations,
    candidates: updateCandidates,
    onboardingConversations,
    conversations: chatConversations,
    abilityEvidence,
    explorationReports,
  }));
}
