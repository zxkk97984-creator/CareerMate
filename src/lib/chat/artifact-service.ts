import { getPrisma } from "@/lib/prisma";
import { toJson } from "@/lib/json";
import type { CareerPlan } from "@/lib/tbox/schemas";
import type { NormalizedAssistantResult } from "@/lib/tbox/types";
import type { TboxStructuredResult } from "@/lib/tbox/capability-schemas";
import type { ChatMessagePart } from "./persistence";
import {
  planRefPart,
  profileCandidateRefPart,
  explorationReportRefPart,
  citationsPart,
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

class PlanTargetRoleMismatch extends Error {}

function normalizeRole(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, "");
}

export interface ChatArtifactDependencies {
  createProfileCandidate(input: CandidateInput): Promise<string>;
  /** 直接保存 Agent 已验证的 plan 为 pending 状态（不触发二次生成） */
  saveAgentPlan(input: {
    userId: string;
    plan: CareerPlan;
    declaredTargetRole?: string;
  }): Promise<{ id: string; version: number }>;
  /** 保存 Agent 生成的职业探索报告 */
  saveExplorationReport(input: {
    userId: string;
    conversationId: string;
    report: { roleName: string; summary: string; responsibilities: string[]; coreCompetencies: string[]; entryPaths: string[]; marketSignals: string[]; learningSuggestions: string[]; fitAnalysis: string[]; risksAndUncertainties: string[]; sources: Array<{ title: string; organization: string; url?: string; accessedAt?: string; label: string }> };
  }): Promise<string>;
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

  async saveAgentPlan(input) {
    const db = getPrisma();
    const profile = await db.userProfile.findUnique({
      where: { userId: input.userId },
      select: { targetRole: true, targetRoleLabel: true },
    });
    const targetRole = profile?.targetRole.trim();
    if (!targetRole) throw new Error("PROFILE_TARGET_ROLE_NOT_FOUND");
    const declaredTargetRole = input.declaredTargetRole?.trim();
    if (declaredTargetRole) {
      const allowedTargets = [targetRole, profile?.targetRoleLabel]
        .filter((value): value is string => Boolean(value?.trim()))
        .map(normalizeRole);
      if (!allowedTargets.includes(normalizeRole(declaredTargetRole))) {
        throw new PlanTargetRoleMismatch();
      }
    }
    // 获取当前最高版本号
    const latest = await db.careerPlan.findFirst({
      where: { userId: input.userId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;
    // 将 Agent 已验证的 career_plan 直接保存为 pending 状态
    const created = await db.careerPlan.create({
      data: {
        userId: input.userId,
        targetRole,
        version,
        status: "pending",
        years: toJson(input.plan.years),
        quarters: toJson(input.plan.quarters),
        months: toJson(input.plan.months),
        currentMonthIndex: input.plan.currentMonth?.monthIndex ?? 1,
        assumptions: toJson(input.plan.assumptions),
        riskNotes: toJson(input.plan.riskNotes),
        generationMeta: toJson({ source: "agent-structured-result" }),
      },
    });
    return { id: created.id, version: created.version };
  },

  async saveExplorationReport(input) {
    const db = getPrisma();
    const created = await db.careerExplorationReport.create({
      data: {
        userId: input.userId,
        conversationId: input.conversationId,
        roleName: input.report.roleName,
        status: "exploratory",
        content: toJson(input.report),
        sources: toJson(input.report.sources),
        executionMeta: toJson({ source: "agent-structured-result" }),
      },
    });
    return created.id;
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

  // career_plan → 直接保存 Agent 已验证的计划（pending 状态，不触发二次生成）
  if (structured.type === "career_plan") {
    try {
      const plan = structured.plan as CareerPlan;
      if (!plan.years || !plan.quarters || !plan.months) {
        parts.push(errorPart("PLAN_INVALID", "Agent 返回的计划结构不完整，请重试。"));
      } else {
        const planId = await dependencies.saveAgentPlan({
          userId,
          plan,
          declaredTargetRole: (structured as { targetRole?: string }).targetRole,
        });
        parts.push(planRefPart(planId.id, planId.version));
      }
    } catch (error) {
      parts.push(error instanceof PlanTargetRoleMismatch
        ? errorPart("PLAN_TARGET_ROLE_MISMATCH", "Agent 计划目标与已确认画像不一致，本次未保存计划。")
        : errorPart("PLAN_CREATE_FAILED", "计划已生成但保存失败，可以稍后重试。"));
    }
  }

  // exploration_report → 保存报告并生成引用卡片
  if (structured.type === "exploration_report") {
    try {
      const reportId = await dependencies.saveExplorationReport({
        userId,
        conversationId,
        report: {
          roleName: structured.roleName,
          summary: structured.summary,
          responsibilities: structured.responsibilities,
          coreCompetencies: structured.coreCompetencies,
          entryPaths: structured.entryPaths,
          marketSignals: structured.marketSignals,
          learningSuggestions: structured.learningSuggestions,
          fitAnalysis: structured.fitAnalysis,
          risksAndUncertainties: structured.risksAndUncertainties,
          sources: structured.sources,
        },
      });
      parts.push(explorationReportRefPart(reportId));
      if (structured.sources.length > 0) {
        parts.push(citationsPart(structured.sources.map((s) => ({
          title: s.title,
          source: s.organization,
          url: s.url,
          accessedAt: s.accessedAt,
          label: s.label as "已核验职业库" | "实时联网调研" | "AI分析与推断",
        }))));
      }
    } catch {
      parts.push(errorPart("REPORT_CREATE_FAILED", "职业探索报告保存失败，可以稍后重试。"));
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
