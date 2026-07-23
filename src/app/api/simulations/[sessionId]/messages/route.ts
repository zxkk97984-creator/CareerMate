import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { generateSimulationTurn } from "@/lib/simulation/generation";
import { containsSimulationTurnProtocol, nextSimulationPrompt, parseSimulationTranscript, simulationDto, simulationScenarioSchema } from "@/lib/simulation";
import { simulationTurnResultSchema } from "@/lib/tbox/capability-schemas";

const bodySchema = z.object({ message: z.string().trim().min(5).max(4_000) }).strict();

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "训练回答无效", 400);
  const { sessionId } = await context.params;
  const session = await getPrisma().simulationSession.findFirst({ where: { id: sessionId, userId: user.id } });
  if (!session) return fail("NOT_FOUND", "训练会话不存在", 404);
  if (session.status !== "active") return fail("SESSION_NOT_ACTIVE", "训练会话已经结束", 409);
  if (session.turnCount >= 6) return fail("MAX_TURNS", "训练已达到最多轮次，请完成评分", 409);
  const scenarioKey = simulationScenarioSchema.safeParse(session.scenarioKey);
  if (!scenarioKey.success) return fail("INVALID_SESSION", "训练场景无效", 400);
  const previousTranscript = parseSimulationTranscript(session.transcript);
  const nextTurn = session.turnCount + 1;
  // 先构造包含本轮用户回答的 transcript，再传给 Agent
  const transcript: { role: "user" | "assistant"; content: string }[] = [
    ...previousTranscript,
    { role: "user", content: parsed.data.message },
  ];

  const result = await generateSimulationTurn({
    userId: user.id,
    scenarioKey: scenarioKey.data,
    scenarioTitle: session.scenarioTitle,
    transcript,
    remoteConversationId: session.remoteConversationId ?? undefined,
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
  const fallbackMessage = nextSimulationPrompt(scenarioKey.data, nextTurn);
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
  const assistantMessage = usedLocalFallback
    ? fallbackMessage
    : agentMessage;

  const updatedTranscript = [...transcript,
    { role: "assistant" as const, content: assistantMessage, meta: executionMeta },
  ];
  const winner = await getPrisma().simulationSession.updateMany({
    where: { id: session.id, userId: user.id, status: "active", updatedAt: session.updatedAt, turnCount: session.turnCount },
    data: { transcript: JSON.stringify(updatedTranscript), turnCount: nextTurn, requestedMode: executionMeta.requestedMode, actualMode: executionMeta.actualMode, remoteConversationId: result.data.conversationId ?? session.remoteConversationId },
  });
  if (winner.count !== 1) return fail("SESSION_CONFLICT", "训练会话已更新，请刷新后重试", 409);
  const persisted = await getPrisma().simulationSession.findUnique({ where: { id: session.id } });
  if (!persisted) return fail("NOT_FOUND", "训练会话不存在", 404);
  return ok({ session: simulationDto(persisted), assistantMessage }, executionMeta as unknown as Record<string, unknown>);
}
