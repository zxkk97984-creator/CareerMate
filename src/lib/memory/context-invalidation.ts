import { getPrisma } from "@/lib/prisma";

/**
 * 本地记忆变化后，使该用户所有非删除会话的上下文版本失效。
 * 同时清空会携带旧记忆的摘要与远端会话绑定，避免下一轮继续复用旧上下文。
 * 这只处理本地快照/远端绑定重建，不宣称能关闭平台自动记忆。
 */
export async function invalidateMemoryContexts(
  userId: string,
  db = getPrisma(),
) {
  await db.chatConversation.updateMany({
    where: { userId, status: { not: "deleted" } },
    data: {
      contextVersion: { increment: 1 },
      summary: "",
      lastSummarizedMessageId: null,
      remoteConversationId: null,
      remoteAgentId: null,
      remoteAgentVersion: null,
      remoteContextVersion: null,
    },
  });
}
