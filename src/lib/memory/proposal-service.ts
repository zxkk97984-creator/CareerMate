import { getPrisma } from "@/lib/prisma";

// ── 类型 ────────────────────────────────────────

export interface MemoryProposalInput {
  userId: string;
  conversationId: string;
  sourceMessageId: string;
  content: string;
  kind: "career_fact" | "preference" | "constraint" | "goal";
  sourceKind: "explicit_remember" | "agent_proposal";
  confidence: number;
  reason: string;
  sensitivity: "normal" | "sensitive";
}

export type MemoryDecision =
  | { action: "auto_confirm"; memoryId: string }
  | { action: "pending"; memoryId: string }
  | { action: "rejected"; reason: string };

// ── 服务 ────────────────────────────────────────

export interface MemoryProposalService {
  processProposal(input: MemoryProposalInput): Promise<MemoryDecision>;
  acceptProposal(memoryId: string, userId: string): Promise<void>;
  rejectProposal(memoryId: string, userId: string): Promise<void>;
  editProposal(memoryId: string, userId: string, content: string): Promise<void>;
}

export function createMemoryProposalService(): MemoryProposalService {
  const db = getPrisma();

  return {
    async processProposal(input) {
      const { userId, conversationId, sourceMessageId, content, kind, sourceKind, confidence, reason, sensitivity } = input;

      // 内容校验
      if (!content || content.trim().length < 3) {
        return { action: "rejected", reason: "content_too_short" };
      }

      // 敏感内容 → pending
      if (sensitivity === "sensitive") {
        const memory = await db.memoryItem.create({
          data: {
            userId,
            content: content.slice(0, 2000),
            source: "agent_proposal",
            sensitivity: "sensitive",
            status: "pending",
            kind,
            scope: "career",
            confidence,
            reason,
            sourceConversationId: conversationId,
            sourceMessageId,
          },
        });
        return { action: "pending", memoryId: memory.id };
      }

      // explicit_remember + normal + high confidence → auto confirm
      if (sourceKind === "explicit_remember" && confidence >= 0.7) {
        const memory = await db.memoryItem.create({
          data: {
            userId,
            content: content.slice(0, 2000),
            source: "explicit_remember",
            sensitivity: "normal",
            status: "confirmed",
            kind,
            scope: "career",
            confidence,
            reason,
            sourceConversationId: conversationId,
            sourceMessageId,
          },
        });
        return { action: "auto_confirm", memoryId: memory.id };
      }

      // agent_proposal → pending
      const memory = await db.memoryItem.create({
        data: {
          userId,
          content: content.slice(0, 2000),
          source: "agent_proposal",
          sensitivity: "normal",
          status: "pending",
          kind,
          scope: "career",
          confidence,
          reason,
          sourceConversationId: conversationId,
          sourceMessageId,
        },
      });
      return { action: "pending", memoryId: memory.id };
    },

    async acceptProposal(memoryId, userId) {
      await db.memoryItem.updateMany({
        where: { id: memoryId, userId, status: "pending" },
        data: { status: "confirmed" },
      });
    },

    async rejectProposal(memoryId, userId) {
      await db.memoryItem.updateMany({
        where: { id: memoryId, userId, status: "pending" },
        data: { status: "rejected" },
      });
    },

    async editProposal(memoryId, userId, content) {
      await db.memoryItem.updateMany({
        where: { id: memoryId, userId, status: "pending" },
        data: { content: content.slice(0, 2000) },
      });
    },
  };
}
