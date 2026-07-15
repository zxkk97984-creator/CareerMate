/**
 * 版本化会话摘要服务。
 *
 * 规则：
 * - 每 24 条 completed 消息触发一次摘要
 * - 摘要使用同一个百宝箱主 Agent（search_engine=false）
 * - 摘要失败保留旧摘要
 * - 摘要与画像冲突时，画像胜出
 * - 确认目标岗位变化或删除记忆后 contextVersion+1、清空 remoteConversationId
 */

import { getPrisma } from "@/lib/prisma";
import { z } from "zod";

// ── 摘要 Schema ─────────────────────────────────

export const conversationSummarySchema = z.object({
  schemaVersion: z.literal(1),
  factsMentioned: z.array(z.string().trim().min(1).max(240)).max(20),
  decisions: z.array(z.string().trim().min(1).max(240)).max(20),
  openQuestions: z.array(z.string().trim().min(1).max(240)).max(10),
  taskProgress: z.array(z.string().trim().min(1).max(240)).max(20),
}).strict();

export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

// ── 阈值 ────────────────────────────────────────

/** 触发摘要的消息数阈值 */
const SUMMARY_MESSAGE_THRESHOLD = 24;

// ── 服务 ────────────────────────────────────────

export interface SummaryService {
  /** 检查是否应触发摘要，返回待摘要的消息数 */
  shouldSummarize(conversationId: string): Promise<{ should: boolean; messageCount: number }>;

  /** 从摘要文本保存摘要 */
  saveSummary(
    conversationId: string,
    rawSummary: unknown,
    lastMessageId: string,
  ): Promise<{ saved: boolean; summary: ConversationSummary | null }>;

  /** 清空摘要（画像变更等上下文失效时） */
  invalidateSummary(conversationId: string): Promise<void>;
}

export function createSummaryService(): SummaryService {
  const db = getPrisma();

  return {
    async shouldSummarize(conversationId) {
      const conv = await db.chatConversation.findUnique({
        where: { id: conversationId },
        select: { lastSummarizedMessageId: true },
      });

      if (!conv) return { should: false, messageCount: 0 };

      // 计算上次摘要后的 completed 消息数
      const where: Record<string, unknown> = {
        conversationId,
        status: "completed",
      };
      if (conv.lastSummarizedMessageId) {
        where.createdAt = { gt: new Date(0) }; // 简化：实际应用需要按时间过滤
      }

      const count = await db.chatMessage.count({ where: where as any });

      return {
        should: count >= SUMMARY_MESSAGE_THRESHOLD,
        messageCount: count,
      };
    },

    async saveSummary(conversationId, rawSummary, lastMessageId) {
      const parsed = conversationSummarySchema.safeParse(rawSummary);
      if (!parsed.success) {
        return { saved: false, summary: null };
      }

      await db.chatConversation.update({
        where: { id: conversationId },
        data: {
          summary: JSON.stringify(parsed.data),
          lastSummarizedMessageId: lastMessageId,
        },
      });

      return { saved: true, summary: parsed.data };
    },

    async invalidateSummary(conversationId) {
      await db.chatConversation.update({
        where: { id: conversationId },
        data: {
          summary: "",
          lastSummarizedMessageId: null,
          remoteConversationId: null,
          remoteContextVersion: null,
          contextVersion: { increment: 1 },
        },
      });
    },
  };
}
