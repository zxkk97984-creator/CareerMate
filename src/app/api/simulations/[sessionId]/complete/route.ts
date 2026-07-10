import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { buildSimulationFeedback } from "@/lib/career";
import { parseJson, toJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";
import { canCompleteSimulation, parseSimulationTranscript, simulationDto } from "@/lib/simulation";

class CompletionConflict extends Error {}

export async function POST(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user?.profile) return fail("UNAUTHORIZED", "未登录或缺少画像", 401);
  const { sessionId } = await context.params;
  const session = await getPrisma().simulationSession.findFirst({ where: { id: sessionId, userId: user.id } });
  if (!session) return fail("NOT_FOUND", "训练会话不存在", 404);
  if (session.status === "completed") return ok({ session: simulationDto(session), feedback: parseJson(session.feedback, {}), candidateId: session.candidateId, alreadyCompleted: true });
  if (session.status !== "active") return fail("SESSION_CONFLICT", "训练会话正在完成", 409);
  if (!canCompleteSimulation(session.turnCount)) return fail("MIN_TURNS", "至少完成 3 轮回答后才能评分", 409);
  const transcript = parseSimulationTranscript(session.transcript);
  const combinedAnswer = transcript.filter((turn) => turn.role === "user").map((turn) => turn.content).join("\n");
  const feedback = buildSimulationFeedback({ scenarioKey: session.scenarioKey, scenarioTitle: session.scenarioTitle, userAnswer: combinedAnswer });
  const scores = parseJson<Record<string, number>>(user.profile.abilityScores, {});
  const field = feedback.profileUpdateCandidate.field;
  const oldValue = field.startsWith("abilityScores.") ? scores[field.split(".")[1]!] ?? null : null;
  try {
    const result = await getPrisma().$transaction(async (tx) => {
      const claim = await tx.simulationSession.updateMany({
        where: { id: session.id, userId: user.id, status: "active", candidateId: null, updatedAt: session.updatedAt },
        data: { status: "completing" },
      });
      if (claim.count !== 1) throw new CompletionConflict();
      const candidate = await tx.profileUpdateCandidate.create({ data: {
        userId: user.id, source: "simulation", field, oldValue: toJson(oldValue),
        newValue: toJson(feedback.profileUpdateCandidate.newValue), confidence: feedback.profileUpdateCandidate.confidence,
        reason: feedback.profileUpdateCandidate.reason,
      } });
      const completed = await tx.simulationSession.update({ where: { id: session.id }, data: {
        status: "completed", score: feedback.score, feedback: toJson(feedback), candidateId: candidate.id,
      } });
      await tx.progressLog.create({ data: {
        userId: user.id, eventType: "simulation_completed", title: `完成模拟训练：${session.scenarioTitle}`,
        summary: `训练得分 ${feedback.score}，已生成画像更新候选。`, metadata: toJson({ simulationId: session.id, candidateId: candidate.id }),
      } });
      return { completed, candidate };
    });
    return ok({ session: simulationDto(result.completed), feedback, candidateId: result.candidate.id, alreadyCompleted: false });
  } catch (error) {
    if (error instanceof CompletionConflict) {
      const latest = await getPrisma().simulationSession.findFirst({ where: { id: session.id, userId: user.id } });
      if (latest?.status === "completed") return ok({ session: simulationDto(latest), feedback: parseJson(latest.feedback, {}), candidateId: latest.candidateId, alreadyCompleted: true });
      return fail("SESSION_CONFLICT", "训练会话正在完成，请稍后刷新", 409);
    }
    return fail("SIMULATION_COMPLETE_FAILED", "训练评分保存失败", 500);
  }
}
