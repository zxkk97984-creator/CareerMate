import { requireCurrentUser } from '@/lib/auth';
import { fail, ok } from '@/lib/api';
import { openTrainingConversation } from '@/lib/simulation/chat-session';
export async function POST(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
 const user = await requireCurrentUser().catch(() => null);
 if (!user) return fail('UNAUTHORIZED', '请先登录', 401);
 const id = await openTrainingConversation(user.id, (await params).sessionId);
 return id ? ok({ conversationId: id }) : fail('NOT_FOUND', '训练不存在', 404);
}
