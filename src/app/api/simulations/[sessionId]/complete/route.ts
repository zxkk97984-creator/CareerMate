import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { parseJson, toJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";
import { canCompleteSimulation, parseSimulationTranscript, simulationDto } from "@/lib/simulation";
import { generateSimulationReport } from "@/lib/simulation/generation";
import { simulationReportResultSchema } from "@/lib/tbox/capability-schemas";
import { createAgentArtifactCandidateService } from "@/lib/agentic-v2/candidate-service";

class CompletionConflict extends Error {}

function resolvedCandidateId(session: {
  candidateId: string | null;
  feedback: string;
}): string | null {
  if (session.candidateId) return session.candidateId;
  const feedback = parseJson<Record<string, unknown>>(session.feedback, {});
  return typeof feedback.candidateId === "string" && feedback.candidateId.trim()
    ? feedback.candidateId.trim()
    : null;
}

export async function POST(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user?.profile) return fail("UNAUTHORIZED", "未登录或缺少画像", 401);
  const { sessionId } = await context.params;
  const session = await getPrisma().simulationSession.findFirst({ where: { id: sessionId, userId: user.id } });
  if (!session) return fail("NOT_FOUND", "训练会话不存在", 404);
  if (session.status === "completed") {
    return ok({
      session: simulationDto(session),
      feedback: parseJson(session.feedback, {}),
      candidateId: resolvedCandidateId(session),
      alreadyCompleted: true,
    });
  }
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
    sessionId: session.id,
  });

  // 校验结构化报告
  const structured = report.data.structured;
  const parsedReport = structured ? simulationReportResultSchema.safeParse(structured) : null;
  const validReport = parsedReport?.success ? parsedReport.data : null;
  if (!validReport) {
    return fail(
      "SIMULATION_REPORT_INVALID",
      "训练报告未通过结构校验，请重试评分",
      422,
      { warnings: report.data.warnings, executionMeta: report.meta },
    );
  }
  if (validReport.scenarioKey !== session.scenarioKey) {
    return fail(
      "SIMULATION_REPORT_SCENARIO_MISMATCH",
      "训练报告与当前场景不匹配，请重试评分",
      422,
      { executionMeta: report.meta },
    );
  }

  // manual/mock 降级模式允许确定性评分；API 模式必须通过 Schema 校验
  const isDegraded = report.meta.degraded;
  const score = validReport.score;
  // 降级报告可以保存确定性评分，但不能据此创建画像候选
  const shouldCreateCandidate = !isDegraded;
  const feedback = {
    score,
    strengths: validReport.strengths,
    improvements: validReport.improvements,
    abilityImpact: validReport.abilityImpact,
    candidateUpdates: validReport.candidateUpdates,
  };

  // 只有通过 Schema 校验的合法报告才创建画像候选
  let candidateId: string | null = null;

  if (shouldCreateCandidate && feedback.candidateUpdates.length > 0) {
    try {
      const candidateService = createAgentArtifactCandidateService();
      const result = await candidateService.createCandidate({
        userId: user.id,
        candidateType: "ability_evidence",
        artifact: {
          schemaVersion: "1.0",
          taskType: "simulation_report",
          status: "pending_confirmation",
          summary: `${session.scenarioTitle} 训练报告`,
          data: {
            abilityEvidence: feedback.candidateUpdates.map((update) => ({
              abilityKey: update.field.replace("abilityScores.", ""),
              summary: update.reason,
              sourceType: "simulation",
              sourceRef: session.id,
              confidence: update.confidence,
            })),
          },
          evidence: [],
          sources: [],
          assumptions: [],
          warnings: [],
          requiresUserConfirmation: true,
          baseVersion: user.profile?.version ?? 1,
          nextActions: [],
        },
        context: {
          sessionId: session.id,
          idempotencyKey: `sim-report-${session.id}`,
        },
      });
      candidateId = result.id;
    } catch {
      // 候选创建失败不影响训练报告保存
    }
  }

  try {
    const result = await getPrisma().$transaction(async (tx) => {
      const claim = await tx.simulationSession.updateMany({
        where: { id: session.id, userId: user.id, status: "active", updatedAt: session.updatedAt },
        data: { status: "completing" },
      });
      if (claim.count !== 1) throw new CompletionConflict();

      const completed = await tx.simulationSession.update({ where: { id: session.id }, data: {
        status: "completed",
        score: feedback.score,
        feedback: toJson({ ...feedback, candidateId }),
        actualMode: report.meta.actualMode,
        remoteConversationId: report.data.conversationId ?? session.remoteConversationId,
      } });
      const summaryBase = `训练得分 ${score}`;
      const summaryExtra = isDegraded
        ? "；来源：降级评分；未生成画像更新候选"
        : candidateId
          ? "；已生成画像更新候选"
          : "；未生成画像更新候选";
      await tx.progressLog.create({ data: {
        userId: user.id, eventType: "simulation_completed", title: `完成模拟训练：${session.scenarioTitle}`,
        summary: summaryBase + summaryExtra,
        metadata: toJson({ simulationId: session.id, candidateId, executionMeta: report.meta }),
      } });
      return { completed, candidateId };
    });
    return ok({ session: simulationDto(result.completed), feedback, candidateId: result.candidateId, alreadyCompleted: false }, report.meta as unknown as Record<string, unknown>);
  } catch (error) {
    if (error instanceof CompletionConflict) {
      const latest = await getPrisma().simulationSession.findFirst({ where: { id: session.id, userId: user.id } });
      if (latest?.status === "completed") {
        return ok({
          session: simulationDto(latest),
          feedback: parseJson(latest.feedback, {}),
          candidateId: resolvedCandidateId(latest),
          alreadyCompleted: true,
        });
      }
      return fail("SESSION_CONFLICT", "训练会话正在完成，请稍后刷新", 409);
    }
    return fail("SIMULATION_COMPLETE_FAILED", "训练评分保存失败", 500);
  }
}
