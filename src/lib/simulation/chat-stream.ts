import { randomUUID } from 'node:crypto';
import type { requireCurrentUser } from '@/lib/auth';
import { getPrisma } from '@/lib/prisma';
import { sendSimulationAnswer } from './messages-service';
import { writeSseEvent, startSseHeartbeat } from '@/lib/chat/sse';

type User = NonNullable<Awaited<ReturnType<typeof requireCurrentUser>>>;
export function streamTrainingAnswer(user: User, conversationId: string, sessionId: string, message: string, requestId: string) {
 return new Response(new ReadableStream<Uint8Array>({
  async start(controller) {
   const stop = startSseHeartbeat(controller);
   const db = getPrisma();
   const lockId = randomUUID();
   let locked = false;
   try {
    const claim = await db.chatConversation.updateMany({ where: { id: conversationId, userId: user.id, status: 'active', OR: [{ activeTurnId: null }, { activeTurnStartedAt: { lt: new Date(Date.now() - 15 * 60_000) } }] }, data: { activeTurnId: lockId, activeTurnStartedAt: new Date() } });
    if (claim.count !== 1) throw new Error('训练正在处理上一条消息，请稍后重试');
    locked = true;
    const marker = JSON.stringify({ simulationRequestId: requestId });
    let saved = await db.chatMessage.findMany({ where: { conversationId, contextMeta: marker }, orderBy: { createdAt: 'asc' } });
    if (!saved.length) {
     const result = await sendSimulationAnswer(new Request('http://localhost/internal', { method: 'POST', body: JSON.stringify({ message, requestId }) }), user, sessionId);
     const body = await result.json();
     if (!body.ok) throw new Error(body.error?.message ?? '训练回答提交失败');
     saved = await db.chatMessage.findMany({ where: { conversationId, contextMeta: marker }, orderBy: { createdAt: 'asc' } });
    }
    const assistant = saved.find(m => m.role === 'assistant');
    const answer = saved.find(m => m.role === 'user');
    if (!assistant || !answer) throw new Error('训练记录尚未同步，请重试');
    writeSseEvent(controller, 'context', { conversationId, userMessageId: answer.id, assistantMessageId: assistant.id, intent: 'simulationScenes', usedProfile: true, usedPlan: false, usedMemoryCount: 0, knowledgeSources: [] });
    writeSseEvent(controller, 'delta', { messageId: assistant.id, text: assistant.content });
    writeSseEvent(controller, 'done', { messageId: assistant.id, status: 'completed', remoteConversationId: null, meta: JSON.parse(assistant.executionMeta) });
   } catch (error) {
    try { writeSseEvent(controller, 'error', { messageId: null, code: 'SIMULATION_TURN_FAILED', message: error instanceof Error ? error.message : '训练失败，请重试', retryable: true }); } catch { /* disconnected */ }
   } finally {
    stop();
    if (locked) await db.chatConversation.updateMany({ where: { id: conversationId, activeTurnId: lockId }, data: { activeTurnId: null, activeTurnStartedAt: null } });
    try { controller.close(); } catch { /* disconnected */ }
   }
  },
 }), { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } });
}
