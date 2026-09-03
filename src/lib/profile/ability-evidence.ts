import { getPrisma } from "@/lib/prisma";
import { abilityKeys, type AbilityKey } from "@/lib/types";

// ── 错误 ────────────────────────────────────────────────

export class EvidenceServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
    this.name = "EvidenceServiceError";
  }
}

// ── 服务接口 ────────────────────────────────────────────

export interface CreateEvidenceInput {
  userId: string;
  abilityKey: string;
  summary: string;
  sourceType: string;
  sourceRef: string | null;
  confidence: number;
}

export interface AbilityEvidenceService {
  createEvidence(input: CreateEvidenceInput): Promise<{
    id: string;
    abilityKey: string;
    status: string;
    summary: string;
    confidence: number;
  }>;
}

// ── 实现 ────────────────────────────────────────────────

export function createAbilityEvidenceService(): AbilityEvidenceService {
  const db = getPrisma();

  return {
    async createEvidence(input) {
      // 置信度校验
      if (input.confidence < 0 || input.confidence > 1) {
        throw new EvidenceServiceError(
          "置信度必须在0到1之间",
          "INVALID_CONFIDENCE",
          400,
        );
      }

      // 能力维度校验
      if (!abilityKeys.includes(input.abilityKey as AbilityKey)) {
        throw new EvidenceServiceError(
          `无效的能力维度: ${input.abilityKey}`,
          "INVALID_ABILITY_KEY",
          400,
        );
      }

      // 摘要校验
      if (!input.summary.trim()) {
        throw new EvidenceServiceError("摘要不能为空", "EMPTY_SUMMARY", 400);
      }

      const row = await db.abilityEvidence.create({
        data: {
          userId: input.userId,
          abilityKey: input.abilityKey,
          summary: input.summary.trim(),
          sourceType: input.sourceType,
          sourceRef: input.sourceRef,
          confidence: input.confidence,
          status: "pending",
          observedAt: new Date(),
        },
      });

      return {
        id: row.id,
        abilityKey: row.abilityKey,
        status: row.status,
        summary: row.summary,
        confidence: row.confidence,
      };
    },
  };
}
