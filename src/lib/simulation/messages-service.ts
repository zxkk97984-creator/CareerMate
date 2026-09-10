import type { Prisma } from "@prisma/client";
import { syncTrainingMessages } from "./chat-session";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { parseJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";
import { generateSimulationTurn } from "@/lib/simulation/generation";
import {
  containsSimulationTurnProtocol,
  nextSimulationPrompt,
  nextSimulationPromptFromSnapshot,
  parseSimulationTranscript,
  simulationDto,
  simulationScenarioSchema,
  simulationScenarioSnapshotSchema,
} from "@/lib/simulation";
import { simulationTurnResultSchema } from "@/lib/tbox/capability-schemas";

const bodySchema = z.object({
  message: z.string().trim().min(5).max(4_000),
  requestId: z.string().trim().min(8).max(160),
}).strict();

export async function sendSimulationAnswer(request: Request, user: NonNullable<Awaited<ReturnType<typeof requireCurrentUser>>>, sessionId: string) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "训练回答无效", 400);
  const session = await getPrisma().simulationSession.findFirst({ where: { id: sessionId, userId: user.id } });
  if (!session) return fail("NOT_FOUND", "训练会话不存在", 404);
  if (session.status !== "active") return fail("SESSION_NOT_ACTIVE", "训练会话已经结束", 409);
  if (session.lastRequestId === parsed.data.requestId) {
    const replayTranscript = parseSimulationTranscript(session.transcript);
    const lastAssistant = [...replayTranscript].reverse().find((turn) => turn.role === "assistant");
    return ok({
      session: simulationDto(session),
      assistantMessage: lastAssistant?.content ?? "",
      idempotent: true,
    });
  }
  if (session.turnCount >= (session.roundLimit ?? 6)) return fail("MAX_TURNS", "训练已达到最多轮次，请完成评分", 409);
  const scenarioKey = simulationScenarioSchema.safeParse(session.scenarioKey);
  if (!scenarioKey.success) return fail("INVALID_SESSION", "训练场景无效", 400);
  const previousTranscript = parseSimulationTranscript(session.transcript);
  const nextTurn = session.turnCount + 1;
  // 百宝箱 simulation_turn 的 round 表示“下一轮追问编号”：
  // 开场白不算用户轮次，第一轮用户回答后的下一轮追问编号为 2。
  const nextRound = nextTurn + 1;
  // 先构造包含本轮用户回答的 transcript，再传给 Agent
  const transcript: { role: "user" | "assistant"; content: string }[] = [
    ...previousTranscript,
    { role: "user", content: parsed.data.message },
  ];
  const parsedSnapshot = simulationScenarioSnapshotSchema.safeParse(parseJson(session.scenarioSnapshot, {}));
  const fixedSnapshot = parsedSnapshot.success ? parsedSnapshot.data : null;
  const atRoundLimit = nextTurn >= (session.roundLimit ?? 6);

  const result = atRoundLimit
    ? {
        data: {
          text: "",
          citations: [],
          warnings: ["ROUND_LIMIT_REACHED"],
          conversationId: session.remoteConversationId ?? undefined,
          structured: undefined,
        },
        meta: {
          requestedMode: session.requestedMode,
          actualMode: session.actualMode,
          degraded: true,
          fallbackReason: "round_limit",
          source: "local-simulation-fallback",
        },
      }
    : await generateSimulationTurn({
        userId: user.id,
        scenarioKey: scenarioKey.data,
        scenarioTitle: session.scenarioTitle,
        scenarioSnapshot: fixedSnapshot,
        transcript,
        remoteConversationId: session.remoteConversationId ?? undefined,
        sessionId: session.id,
        expectedRound: nextRound,
      });

  // V2 协议：result.data.text 包含信封中的 nextQuestion；structured 已被淘汰
  const structuredTurn = simulationTurnResultSchema.safeParse(result.data.structured);
  const structuredMessage = structuredTurn.success
    && structuredTurn.data.scenarioKey === scenarioKey.data
    && structuredTurn.data.turnIndex === nextTurn
    ? structuredTurn.data.assistantMessage.trim()
    : "";
  const protocolText = containsSimulationTurnProtocol(result.data.text);
  const v2TextMessage = result.data.text?.trim() ?? "";
  const agentMessage = structuredMessage || (protocolText ? "" : v2TextMessage);
  const fallbackMessage = nextSimulationPromptFromSnapshot(fixedSnapshot, nextTurn)
    ?? nextSimulationPrompt(scenarioKey.data, nextTurn)
    ?? "训练轮次已完成，请点击“完成并评分”生成报告。";
  const usedLocalFallback = result.meta.degraded || !agentMessage;
  const executionMeta = usedLocalFallback
    ? {
      requestedMode: result.meta.requestedMode,
      actualMode: "mock" as const,
      degraded: true,
      fallbackReason: result.meta.fallbackReason
        ?? (result.data.warnings.includes("SCHEMA_MISMATCH") ? "validation_error" : "invalid_response"),
      source: "local-simulation-fallback",
    }
    : result.meta;
  if (session.conversationId && usedLocalFallback && result.meta.requestedMode === "api" && !atRoundLimit) {
    return fail("SIMULATION_TURN_FAILED", "AI 暂未返回有效追问，请重试；本轮尚未计入训练进度", 502);
  }
  const assistantMessage = usedLocalFallback
    ? fallbackMessage
    : agentMessage;

  const updatedTranscript = [...transcript,
    { role: "assistant" as const, content: assistantMessage, meta: executionMeta },
  ];
  const persist = async (tx: Prisma.TransactionClient) => {
  const updated = await tx.simulationSession.updateMany({
    where: {
      id: session.id,
      userId: user.id,
      status: "active",
      updatedAt: session.updatedAt,
      turnCount: session.turnCount,
      OR: [
        { lastRequestId: null },
        { lastRequestId: { not: parsed.data.requestId } },
      ],
    },
    data: {
      transcript: JSON.stringify(updatedTranscript),
      turnCount: nextTurn,
      requestedMode: executionMeta.requestedMode,
      actualMode: executionMeta.actualMode,
      remoteConversationId: result.data.conversationId ?? session.remoteConversationId,
      lastRequestId: parsed.data.requestId,
    },
  });
  if (updated.count === 1 && session.conversationId) {
    const saved = await tx.simulationSession.findUniqueOrThrow({ where: { id: session.id } });
    await syncTrainingMessages(tx, saved);
    await tx.chatMessage.updateMany({ where: { conversationId: session.conversationId, clientRequestId: { in: [`simulation:${session.id}:${updatedTranscript.length - 2}`, `simulation:${session.id}:${updatedTranscript.length - 1}`] } }, data: { contextMeta: JSON.stringify({ simulationRequestId: parsed.data.requestId }) } });
  }
  return updated;
  };
  const winner = session.conversationId ? await getPrisma().$transaction(persist) : await persist(getPrisma());
  if (winner.count !== 1) {
    const replay = await getPrisma().simulationSession.findUnique({ where: { id: session.id } });
    if (replay?.lastRequestId === parsed.data.requestId) {
      const replayTranscript = parseSimulationTranscript(replay.transcript);
      const lastAssistant = [...replayTranscript].reverse().find((turn) => turn.role === "assistant");
      return ok({
        session: simulationDto(replay),
        assistantMessage: lastAssistant?.content ?? "",
        idempotent: true,
      });
    }
    return fail("SESSION_CONFLICT", "训练会话已更新，请刷新后重试", 409);
  }
  const persisted = await getPrisma().simulationSession.findUnique({ where: { id: session.id } });
  if (!persisted) return fail("NOT_FOUND", "训练会话不存在", 404);
  return ok({ session: simulationDto(persisted), assistantMessage }, executionMeta as unknown as Record<string, unknown>);
}
