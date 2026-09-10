import { requireCurrentUser } from '@/lib/auth';
import { fail, ok } from '@/lib/api';
import { getPrisma } from '@/lib/prisma';
import { simulationDto } from '@/lib/simulation';
export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
 const user = await requireCurrentUser().catch(() => null);
 if (!user) return fail('UNAUTHORIZED', '请先登录', 401);
 const session = await getPrisma().simulationSession.findFirst({ where: { id: (await params).sessionId, userId: user.id } });
 return session ? ok(simulationDto(session)) : fail('NOT_FOUND', '训练不存在', 404);
}
