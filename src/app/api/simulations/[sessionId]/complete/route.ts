import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { parseJson, toJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";
import { canCompleteSimulation, parseSimulationTranscript, simulationDto } from "@/lib/simulation";
import { generateSimulationReport } from "@/lib/simulation/generation";
import { simulationReportResultSchema } from "@/lib/tbox/capability-schemas";
import { ALLOWED_CANDIDATE_FIELDS } from "@/lib/profile/candidate-service";

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

  // 使用主 Agent 生成结构化报告（失败时降级到确定性评分）
  const report = await generateSimulationReport({
    userId: user.id,
    scenarioKey: session.scenarioKey as Parameters<typeof generateSimulationReport>[0]["scenarioKey"],
    scenarioTitle: session.scenarioTitle,
    transcript: transcript.filter((t) => t.role === "user" || t.role === "assistant"),
    remoteConversationId: session.remoteConversationId ?? undefined,
  });

  // 校验结构化报告
  const structured = report.data.structured;
  const parsedReport = structured ? simulationReportResultSchema.safeParse(structured) : null;
  const validReport = parsedReport?.success ? parsedReport.data : null;

  const score = validReport?.score ?? 0;
  const feedback = {
    score,
    strengths: validReport?.strengths ?? [],
    improvements: validReport?.improvements ?? [],
    abilityImpact: validReport?.abilityImpact ?? {},
    candidateUpdates: validReport?.candidateUpdates ?? [],
  };

  // 从候选更新中提取第一个合法字段（白名单检查）
  const scores = parseJson<Record<string, number>>(user.profile.abilityScores, {});
  const primaryUpdate = feedback.candidateUpdates.find((u) => ALLOWED_CANDIDATE_FIELDS.has(u.field));
  const field = primaryUpdate?.field ?? "abilityScores.communication";
  const newValue = primaryUpdate?.newValue ?? score;
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
        newValue: toJson(newValue), confidence: primaryUpdate?.confidence ?? 0.7,
        reason: primaryUpdate?.reason ?? "模拟训练自动评估",
        evidenceExcerpt: primaryUpdate?.evidenceExcerpt ?? "",
        impactSummary: primaryUpdate?.impactSummary ?? "",
      } });
      const completed = await tx.simulationSession.update({ where: { id: session.id }, data: {
        status: "completed", score, feedback: toJson(feedback), candidateId: candidate.id,
        actualMode: report.meta.actualMode,
      } });
      await tx.progressLog.create({ data: {
        userId: user.id, eventType: "simulation_completed", title: `完成模拟训练：${session.scenarioTitle}`,
        summary: `训练得分 ${score}，已生成画像更新候选。来源：${report.meta.degraded ? "降级评分" : "Agent 结构化报告"}`,
        metadata: toJson({ simulationId: session.id, candidateId: candidate.id, executionMeta: report.meta }),
      } });
      return { completed, candidate };
    });
    return ok({ session: simulationDto(result.completed), feedback, candidateId: result.candidate.id, alreadyCompleted: false }, report.meta as unknown as Record<string, unknown>);
  } catch (error) {
    if (error instanceof CompletionConflict) {
      const latest = await getPrisma().simulationSession.findFirst({ where: { id: session.id, userId: user.id } });
      if (latest?.status === "completed") return ok({ session: simulationDto(latest), feedback: parseJson(latest.feedback, {}), candidateId: latest.candidateId, alreadyCompleted: true });
      return fail("SESSION_CONFLICT", "训练会话正在完成，请稍后刷新", 409);
    }
    return fail("SIMULATION_COMPLETE_FAILED", "训练评分保存失败", 500);
  }
}
