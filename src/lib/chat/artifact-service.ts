import { getPrisma } from "@/lib/prisma";
import { toJson } from "@/lib/json";
import { createPlanGenerationService } from "@/lib/plans/generation-service";
import type { NormalizedAssistantResult } from "@/lib/tbox/types";
import type { TboxStructuredResult } from "@/lib/tbox/capability-schemas";
import type { ChatMessagePart } from "./persistence";
import {
  planRefPart,
  profileCandidateRefPart,
  errorPart,
} from "./artifacts";

interface CandidateInput {
  userId: string;
  sourceConversationId: string;
  field: string;
  newValue: unknown;
  confidence: number;
  reason: string;
  evidenceExcerpt: string;
  impactSummary: string;
}

export interface ChatArtifactDependencies {
  createProfileCandidate(input: CandidateInput): Promise<string>;
  createPendingPlan(userId: string, conversationId?: string): Promise<{ id: string; version: number }>;
  listPendingCandidateIds(input: {
    userId: string;
    conversationId: string;
  }): Promise<string[]>;
}

interface ChatArtifactInput {
  userId: string;
  conversationId: string;
  /** 来自本次 Agent 响应的归一化结果（通过 parseStructuredAssistantResult 处理后） */
  assistantResult: NormalizedAssistantResult;
}

// 画像字段白名单（与 candidate-service.ts 保持一致）
const ALLOWED_CANDIDATE_FIELDS = new Set([
  "educationStage", "major", "targetRole", "targetRoleLabel",
  "weeklyAvailableHours", "learningPreference", "experienceSummary",
  "interestTags", "constraints",
  "abilityScores.aiTooling", "abilityScores.roleFoundation",
  "abilityScores.dataAnalysis", "abilityScores.businessProduct",
  "abilityScores.communication", "abilityScores.projectPractice",
]);

const productionDependencies: ChatArtifactDependencies = {
  async createProfileCandidate(input) {
    const db = getPrisma();
    const serializedValue = toJson(input.newValue);
    const existing = await db.profileUpdateCandidate.findFirst({
      where: {
        userId: input.userId,
        field: input.field,
        newValue: serializedValue,
        status: "pending",
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing.id;
    const profile = await db.userProfile.findUnique({ where: { userId: input.userId } });
    if (!profile) throw new Error("PROFILE_NOT_FOUND");
    const oldValue = input.field === "weeklyAvailableHours"
      ? profile.weeklyAvailableHours
      : null;
    const candidate = await db.profileUpdateCandidate.create({
      data: {
        userId: input.userId,
        source: "chat",
        field: input.field,
        oldValue: toJson(oldValue),
        newValue: serializedValue,
        confidence: input.confidence,
        reason: input.reason,
        sourceConversationId: input.sourceConversationId,
        evidenceExcerpt: input.evidenceExcerpt,
        impactSummary: input.impactSummary,
        status: "pending",
      },
    });
    return candidate.id;
  },

  async createPendingPlan(userId, conversationId) {
    const { plan } = await createPlanGenerationService().ensureGenerationPlan({
      userId,
      conversationId,
    });
    return { id: plan.id, version: plan.version };
  },

  async listPendingCandidateIds(input) {
    const rows = await getPrisma().profileUpdateCandidate.findMany({
      where: {
        userId: input.userId,
        sourceConversationId: input.conversationId,
        status: "pending",
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  },
};

export async function createArtifactsForChat(
  input: ChatArtifactInput,
  dependencies: ChatArtifactDependencies = productionDependencies,
): Promise<ChatMessagePart[]> {
  const parts: ChatMessagePart[] = [];
  const { userId, conversationId, assistantResult } = input;
  const structured = assistantResult.structured as TboxStructuredResult | undefined;

  // SCHEMA_MISMATCH → 返回安全 error part 或 warning，但不创建引用卡片
  if (assistantResult.warnings.includes("SCHEMA_MISMATCH")) {
    parts.push(errorPart(
      "SCHEMA_MISMATCH",
      "回答已保留，但结构化卡片未生成。",
    ));
    return parts;
  }

  // 没有结构化结果 → 返回空 parts，文本照常完成
  if (!structured) {
    return parts;
  }

  // ── 按结构化结果类型创建候选 ────────────────────────

  // 处理 candidateUpdates（多个能力类型可能都有此字段）
  const candidateUpdates = "candidateUpdates" in structured
    ? (structured as unknown as { candidateUpdates?: Array<{
        field: string; newValue: unknown; confidence: number;
        reason: string; evidenceExcerpt: string; impactSummary: string;
      }> }).candidateUpdates
    : undefined;

  if (candidateUpdates && Array.isArray(candidateUpdates)) {
    for (const update of candidateUpdates) {
      if (!ALLOWED_CANDIDATE_FIELDS.has(update.field)) continue;
      try {
        const candidateId = await dependencies.createProfileCandidate({
          userId,
          sourceConversationId: conversationId,
          field: update.field,
          newValue: update.newValue,
          confidence: update.confidence,
          reason: update.reason,
          evidenceExcerpt: update.evidenceExcerpt,
          impactSummary: update.impactSummary,
        });
        parts.push(profileCandidateRefPart(candidateId));
      } catch {
        // 创建候选失败不中断整个流程
      }
    }
  }

  // career_plan → 创建 pending plan
  if (structured.type === "career_plan") {
    try {
      const plan = await dependencies.createPendingPlan(userId, conversationId);
      parts.push(planRefPart(plan.id, plan.version));
    } catch {
      parts.push(errorPart("PLAN_CREATE_FAILED", "计划卡片未生成，可以稍后重试。"));
    }
  }

  // simulation_report → report ref
  if (structured.type === "simulation_report") {
    // sessionId 需要从调用上下文传入，这里通过 structured 本身不包含
    // 由模拟训练完成的 API 路由单独处理
  }

  // ── 合并已有候选 ──────────────────────────────────

  try {
    const referencedCandidateIds = new Set(
      parts
        .filter((p): p is Extract<ChatMessagePart, { type: "profile_candidate_ref" }> => p.type === "profile_candidate_ref")
        .map((p) => p.candidateId),
    );
    const conversationCandidateIds = await dependencies.listPendingCandidateIds({
      userId,
      conversationId,
    });
    for (const candidateId of conversationCandidateIds) {
      if (referencedCandidateIds.has(candidateId)) continue;
      parts.push(profileCandidateRefPart(candidateId));
      referencedCandidateIds.add(candidateId);
    }
  } catch {
    // 查询候选失败不中断流程
  }

  return parts;
}
