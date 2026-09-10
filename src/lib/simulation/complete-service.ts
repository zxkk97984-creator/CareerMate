import { randomUUID } from "node:crypto";
import { syncTrainingMessages } from "./chat-session";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { parseJson, toJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";
import { canCompleteSimulation, parseSimulationTranscript, simulationDto, simulationScenarioSnapshotSchema } from "@/lib/simulation";
import { generateSimulationReport } from "@/lib/simulation/generation";
import { simulationReportResultSchema } from "@/lib/tbox/capability-schemas";
import { createAgentArtifactCandidateService, type CandidateTransaction } from "@/lib/agentic-v2/candidate-service";

class CompletionConflict extends Error {}

function normalizeEvidenceText(value: string): string {
  return value.toLowerCase().replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()【】\[\]-]/g, "");
}

function evidenceSupportScore(excerpt: string, answer: string): number {
  const needle = normalizeEvidenceText(excerpt);
  const haystack = normalizeEvidenceText(answer);
  if (!needle || !haystack) return 0;
  if (haystack.includes(needle)) return 1;

  const grams = new Set<string>();
  for (let index = 0; index < needle.length - 1; index += 1) {
    grams.add(needle.slice(index, index + 2));
  }
  if (grams.size === 0) return 0;
  let matched = 0;
  for (const gram of grams) {
    if (haystack.includes(gram)) matched += 1;
  }
  return matched / grams.size;
}

function isEvidenceSupported(
  excerpt: string,
  transcript: ReturnType<typeof parseSimulationTranscript>,
): boolean {
  const userAnswers = transcript.filter((turn) => turn.role === "user").map((turn) => turn.content);
  return userAnswers.some((answer) => evidenceSupportScore(excerpt, answer) >= 0.4);
}

function resolvedCandidateId(session: {
  candidateId: string | null;
  feedback: string;
}): string | null {
  if (session.candidateId) return session.candidateId;
  const feedback = parseJson<Record<string, unknown>>(session.feedback, {});
  // 优先从 feedback 中查找 V2 候选 ID（AgentArtifactCandidate）
  if (typeof feedback.artifactCandidateId === "string" && feedback.artifactCandidateId.trim()) {
    return feedback.artifactCandidateId.trim();
  }
  return typeof feedback.candidateId === "string" && feedback.candidateId.trim()
    ? feedback.candidateId.trim()
    : null;
}

async function completeTraining(request: Request, user: NonNullable<Awaited<ReturnType<typeof requireCurrentUser>>>, sessionId: string) {
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
  if (!canCompleteSimulation(session.turnCount, session.roundLimit ?? 6)) return fail("MIN_TURNS", "至少完成 3 轮回答后才能评分", 409);
  const transcript = parseSimulationTranscript(session.transcript);
  const snapshot = simulationScenarioSnapshotSchema.safeParse(parseJson(session.scenarioSnapshot, {}));

  // 使用主 Agent 生成结构化报告（失败时降级到确定性评分）
  const report = await generateSimulationReport({
    userId: user.id,
    scenarioKey: session.scenarioKey as Parameters<typeof generateSimulationReport>[0]["scenarioKey"],
    scenarioTitle: session.scenarioTitle,
    transcript: transcript.filter((t) => t.role === "user" || t.role === "assistant"),
    remoteConversationId: session.remoteConversationId ?? undefined,
    sessionId: session.id,
    scenarioSnapshot: snapshot.success ? snapshot.data : null,
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
  const supportedEvidence = validReport.evidence.filter(
    (item) => isEvidenceSupported(item, transcript),
  );
  const supportedCandidateUpdates = validReport.candidateUpdates.filter(
    (update) => isEvidenceSupported(update.evidenceExcerpt, transcript),
  );
  const droppedEvidenceCount = validReport.evidence.length - supportedEvidence.length;
  const droppedCandidateUpdateCount = validReport.candidateUpdates.length - supportedCandidateUpdates.length;
  // 降级报告可以保存确定性评分，但不能据此创建画像候选
  const shouldCreateCandidate = !isDegraded && supportedCandidateUpdates.length > 0;
  const evidence = supportedEvidence.length > 0
    ? supportedEvidence
    : transcript
      .filter((turn) => turn.role === "user")
      .map((turn) => turn.content.replace(/\s+/g, " ").slice(0, 180))
      .filter(Boolean)
      .slice(0, 5);
  const feedback = {
    score,
    strengths: validReport.strengths,
    improvements: validReport.improvements,
    evidence,
    abilityImpact: validReport.abilityImpact,
    candidateUpdates: supportedCandidateUpdates,
    ...(droppedEvidenceCount > 0 || droppedCandidateUpdateCount > 0
      ? { evidenceWarnings: [
        ...(droppedEvidenceCount > 0 ? [`${droppedEvidenceCount} 条报告依据无法在用户回答中定位，已忽略`] : []),
        ...(droppedCandidateUpdateCount > 0 ? [`${droppedCandidateUpdateCount} 条能力更新缺少可验证回答依据，未生成候选`] : []),
      ] }
      : {}),
  };

  // 候选创建、模拟完成、ProgressLog 写入放在同一事务
  try {
    const result = await getPrisma().$transaction(async (tx) => {
      const claim = await tx.simulationSession.updateMany({
        where: { id: session.id, userId: user.id, status: "active", updatedAt: session.updatedAt },
        data: { status: "completing" },
      });
      if (claim.count !== 1) throw new CompletionConflict();

      // 在同一事务内创建 V2 候选（AgentArtifactCandidate）
      // shouldCreateCandidate=true 时，候选创建失败让事务回滚，返回稳定错误码允许重试
      let candidateIdInTx: string | null = null;
      if (shouldCreateCandidate && feedback.candidateUpdates.length > 0) {
        try {
          const candidateService = createAgentArtifactCandidateService();
          const candidateResult = await candidateService.createCandidateInTx({
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
                  summary: `${update.reason}；依据：${update.evidenceExcerpt}`.slice(0, 500),
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
          }, tx as unknown as CandidateTransaction);
          candidateIdInTx = candidateResult.id;
        } catch (err) {
          // 候选创建失败 → 事务回滚，返回稳定公开错误码，允许安全重试
          const msg = err instanceof Error ? err.message : "候选创建失败";
          if (msg.includes("INVALID_CANDIDATE_DATA") || msg.includes("INVALID_ARTIFACT")) {
            throw new Error(`SIMULATION_CANDIDATE_INVALID: ${msg.slice(0, 200)}`);
          }
          throw new Error(`SIMULATION_CANDIDATE_FAILED: ${msg.slice(0, 200)}`);
        }
      }

      const completed = await tx.simulationSession.update({ where: { id: session.id }, data: {
        status: "completed",
        score: feedback.score,
        feedback: toJson({ ...feedback, artifactCandidateId: candidateIdInTx }),
        actualMode: report.meta.actualMode,
        remoteConversationId: report.data.conversationId ?? session.remoteConversationId,
        completedAt: new Date(),
      } });
      if (completed.conversationId) await syncTrainingMessages(tx, completed);
      const summaryBase = `训练得分 ${score}`;
      const summaryExtra = isDegraded
        ? "；来源：降级评分；未生成画像更新候选"
        : candidateIdInTx
          ? "；已生成画像更新候选"
          : "；未生成画像更新候选";
      await tx.progressLog.create({ data: {
        userId: user.id, eventType: "simulation_completed", title: `完成模拟训练：${session.scenarioTitle}`,
        summary: summaryBase + summaryExtra,
        metadata: toJson({ simulationId: session.id, candidateId: candidateIdInTx, executionMeta: report.meta }),
      } });
      return { completed, candidateId: candidateIdInTx };
    });
    return ok({
      session: simulationDto(result.completed),
      feedback,
      candidateId: result.candidateId,
      alreadyCompleted: false,
    }, report.meta as unknown as Record<string, unknown>);
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

/** Serialize scoring with answers on linked chats; the report transaction remains authoritative. */
export async function completeSimulation(request: Request, user: NonNullable<Awaited<ReturnType<typeof requireCurrentUser>>>, sessionId: string) {
 const db = getPrisma();
 const session = await db.simulationSession.findFirst({ where: { id: sessionId, userId: user.id } });
 if (!session?.conversationId) return completeTraining(request, user, sessionId);
 const lock = randomUUID();
 const claim = await db.chatConversation.updateMany({ where: { id: session.conversationId, userId: user.id, OR: [{ activeTurnId: null }, { activeTurnStartedAt: { lt: new Date(Date.now() - 15 * 60_000) } }] }, data: { activeTurnId: lock, activeTurnStartedAt: new Date() } });
 if (claim.count !== 1) return fail("SESSION_CONFLICT", "训练正在处理，请稍后重试", 409);
 try { return await completeTraining(request, user, sessionId); }
 finally { await db.chatConversation.updateMany({ where: { id: session.conversationId, activeTurnId: lock }, data: { activeTurnId: null, activeTurnStartedAt: null } }); }
}
