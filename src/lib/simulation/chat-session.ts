import type { Prisma, SimulationSession } from '@prisma/client';
import { getPrisma } from '@/lib/prisma';
import { parseSimulationTranscript, simulationDto } from '@/lib/simulation';

/** Import by stable transcript position, so retries and legacy restoration are safe. */
export async function syncTrainingMessages(tx: Prisma.TransactionClient, session: SimulationSession) {
  if (!session.conversationId) return;
  const transcript = parseSimulationTranscript(session.transcript);
  for (const [index, turn] of transcript.entries()) {
    const clientRequestId = `simulation:${session.id}:${index}`;
    await tx.chatMessage.upsert({
      where: { conversationId_clientRequestId_role: { conversationId: session.conversationId, clientRequestId, role: turn.role } },
      create: { conversationId: session.conversationId, clientRequestId, role: turn.role, content: turn.content,
        createdAt: new Date(session.createdAt.getTime() + index), executionMeta: JSON.stringify(turn.meta ?? {}) },
      update: {},
    });
  }
  if (session.status === 'completed') {
    const clientRequestId = `simulation-report:${session.id}`;
    await tx.chatMessage.upsert({
      where: { conversationId_clientRequestId_role: { conversationId: session.conversationId, clientRequestId, role: 'assistant' } },
      create: { conversationId: session.conversationId, clientRequestId, role: 'assistant', content: '本次训练已结束。你可以查看报告，或继续询问改进建议。',
        parts: JSON.stringify([{ type: 'simulation_report_ref', sessionId: session.id }]), createdAt: session.completedAt ?? new Date() }, update: {},
    });
  }
  await tx.chatConversation.update({ where: { id: session.conversationId }, data: { lastMessageAt: new Date(), ...(session.status === 'completed' ? { summary: `这是一场已完成的模拟训练：${session.scenarioTitle}。后续仅讨论报告和改进建议，不继续计轮或重新评分。\n训练报告：${session.feedback}` } : {}) } });
}

export async function attachTrainingConversation(tx: Prisma.TransactionClient, session: SimulationSession) {
  let conversation = session.conversationId ? await tx.chatConversation.findUnique({ where: { id: session.conversationId } }) : null;
  // Restoring a deleted chat preserves all prior discussion and keeps the same association.
  if (conversation?.status === 'deleted') conversation = await tx.chatConversation.update({ where: { id: conversation.id }, data: { status: 'active' } });
  if (!conversation) {
    conversation = await tx.chatConversation.create({ data: { userId: session.userId, title: `模拟训练 · ${session.scenarioTitle}`.slice(0, 60) } });
    session = await tx.simulationSession.update({ where: { id: session.id }, data: { conversationId: conversation.id } });
  }
  await syncTrainingMessages(tx, session);
  return conversation.id;
}

export async function openTrainingConversation(userId: string, sessionId: string) {
  return getPrisma().$transaction(async tx => {
    const session = await tx.simulationSession.findFirst({ where: { id: sessionId, userId } });
    if (!session) return null;
    return attachTrainingConversation(tx, session);
  });
}

export async function trainingForConversation(userId: string, conversationId: string) {
  const session = await getPrisma().simulationSession.findFirst({ where: { userId, conversationId } });
  return session ? { ...simulationDto(session), conversationId } : null;
}
