import { getPrisma } from "@/lib/prisma";
import { agentArtifactV1Schema, type AgentArtifactV1 } from "./contracts";
import type { AgentArtifactCandidateType } from "./candidate-service";

// ── 错误类型 ──────────────────────────────────────────────
export class AgentArtifactCandidateResolutionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AgentArtifactCandidateResolutionError";
  }
}

// ── 输入输出 ──────────────────────────────────────────────
export interface ResolveAgentArtifactCandidateInput {
  userId: string;
  candidateId: string;
  decision: "accept" | "reject";
}

export interface ResolvedAgentArtifactCandidate {
  id: string;
  status: "accepted" | "rejected";
  candidateType: AgentArtifactCandidateType;
}

interface ResolutionDatabase {
  agentArtifactCandidate: {
    findFirst(args: {
      where: { id: string; userId: string };
    }): Promise<{
      id: string;
      userId: string;
      candidateType: string;
      status: string;
      artifact: string;
      baseVersion: number | null;
      sourceSessionId: string;
      sourceConversationId: string | null;
      resolvedAt: Date | null;
    } | null>;
    update(args: {
      where: { id: string };
      data: { status: string; resolvedAt: Date };
    }): Promise<unknown>;
  };
  careerPlan: {
    findFirst(args: { where: { userId: string; status: string }; orderBy: { version: "desc" } }): Promise<{ id: string; version: number } | null>;
    updateMany(args: { where: { userId: string; status: string }; data: { status: string } }): Promise<unknown>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
  userProfile: {
    findUnique(args: { where: { userId: string } }): Promise<{ version: number } | null>;
    update(args: { where: { userId: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
  abilityEvidence: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
  memoryItem: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
  roleDraft: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
  $transaction<T>(operation: (tx: Omit<ResolutionDatabase, "$transaction">) => Promise<T>): Promise<T>;
}

// ── 主入口 ────────────────────────────────────────────────
export async function resolveAgentArtifactCandidate(
  input: ResolveAgentArtifactCandidateInput,
  dependencies: { db?: ResolutionDatabase } = {},
): Promise<ResolvedAgentArtifactCandidate> {
  const db = dependencies.db ?? (getPrisma() as unknown as ResolutionDatabase);

  return db.$transaction(async (tx) => {
    // 1. 加载候选
    const candidate = await tx.agentArtifactCandidate.findFirst({
      where: { id: input.candidateId, userId: input.userId },
    });

    if (!candidate) {
      throw new AgentArtifactCandidateResolutionError(
        "候选未找到",
        "CANDIDATE_NOT_FOUND",
        404,
      );
    }

    // 2. 校验 artifact
    const artifactResult = safeParseArtifact(candidate.artifact);
    if (!artifactResult) {
      throw new AgentArtifactCandidateResolutionError(
        "候选数据损坏",
        "CANDIDATE_CORRUPT",
        500,
      );
    }

    // 3. 已解决 → 幂等或冲突
    const resolvedStatus = candidate.status as "accepted" | "rejected";
    const decisionStatus = input.decision === "accept" ? "accepted" : "rejected";
    if (resolvedStatus === "accepted" || resolvedStatus === "rejected") {
      if (resolvedStatus === decisionStatus) {
        return {
          id: candidate.id,
          status: resolvedStatus,
          candidateType: candidate.candidateType as AgentArtifactCandidateType,
        };
      }
      throw new AgentArtifactCandidateResolutionError(
        "候选已被处理，无法更改决定",
        "CANDIDATE_ALREADY_RESOLVED",
        409,
      );
    }

    // 4. 拒绝 → 简单更新
    if (input.decision === "reject") {
      await tx.agentArtifactCandidate.update({
        where: { id: candidate.id },
        data: { status: "rejected", resolvedAt: new Date() },
      });
      return {
        id: candidate.id,
        status: "rejected",
        candidateType: candidate.candidateType as AgentArtifactCandidateType,
      };
    }

    // 5. 接受 → 验证版本 + 类型投影
    const candidateType = candidate.candidateType as AgentArtifactCandidateType;
    const artifact = artifactResult;

    // 版本检查（仅对需要版本的候选类型）
    if (artifact.baseVersion !== null && artifact.baseVersion !== undefined) {
      const currentProfile = await tx.userProfile.findUnique({
        where: { userId: input.userId },
      });
      if (currentProfile && currentProfile.version !== artifact.baseVersion) {
        throw new AgentArtifactCandidateResolutionError(
          "数据版本已变化，请重新生成候选",
          "BASE_VERSION_CONFLICT",
          409,
        );
      }
    }

    // 类型投影
    await applyProjection(tx, input.userId, candidateType, artifact);

    // 标记已接受
    await tx.agentArtifactCandidate.update({
      where: { id: candidate.id },
      data: { status: "accepted", resolvedAt: new Date() },
    });

    return {
      id: candidate.id,
      status: "accepted",
      candidateType,
    };
  });
}

// ── artifact 安全解析 ─────────────────────────────────────
function safeParseArtifact(raw: string): AgentArtifactV1 | null {
  try {
    const parsed = JSON.parse(raw);
    const result = agentArtifactV1Schema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

// ── 类型投影 ──────────────────────────────────────────────
async function applyProjection(
  tx: Omit<ResolutionDatabase, "$transaction">,
  userId: string,
  candidateType: AgentArtifactCandidateType,
  artifact: AgentArtifactV1,
): Promise<void> {
  const data = artifact.data as Record<string, unknown> | null | undefined;
  if (!data || typeof data !== "object") return;

  switch (candidateType) {
    case "profile_patch": {
      // 仅允许更新已有可变字段
      const patch = data.patch as Record<string, unknown> | undefined;
      if (patch && typeof patch === "object") {
        const allowedKeys = new Set([
          "targetRole", "targetRoleLabel", "weeklyAvailableHours",
          "educationStage", "major", "learningPreference", "experienceSummary",
          "interestTags", "constraints",
        ]);
        const filtered: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(patch)) {
          if (allowedKeys.has(key) && value !== undefined) {
            filtered[key] = typeof value === "object" ? JSON.stringify(value) : value;
          }
        }
        if (Object.keys(filtered).length > 0) {
          await tx.userProfile.update({ where: { userId }, data: filtered });
        }
      }
      break;
    }

    case "ability_evidence": {
      const items = data.abilityEvidence as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(items)) {
        for (const item of items) {
          if (typeof item.abilityKey === "string" && item.abilityKey.trim()) {
            await tx.abilityEvidence.create({
              data: {
                userId,
                abilityKey: String(item.abilityKey).trim(),
                summary: String(item.summary ?? "").slice(0, 500),
                sourceType: String(item.sourceType ?? "agent"),
                sourceRef: item.sourceRef ? String(item.sourceRef) : null,
                confidence: typeof item.confidence === "number" ? item.confidence : 0.5,
                status: "confirmed",
              },
            });
          }
        }
      }
      break;
    }

    case "career_plan": {
      // 停用旧计划
      await tx.careerPlan.updateMany({
        where: { userId, status: "active" },
        data: { status: "inactive" },
      });
      // 创建新计划
      const planData = data as Record<string, unknown>;
      await tx.careerPlan.create({
        data: {
          userId,
          targetRole: String(planData.targetRole ?? "unknown"),
          version: (artifact.baseVersion ?? 1) + 1,
          status: "active",
          schemaVersion: 2,
          content: JSON.stringify(planData),
          targetRoleLabel: planData.targetRoleLabel ? String(planData.targetRoleLabel) : null,
          activatedAt: new Date(),
          years: JSON.stringify((planData.years as unknown[]) ?? []),
          quarters: JSON.stringify((planData.quarters as unknown[]) ?? []),
          months: JSON.stringify((planData.months as unknown[]) ?? []),
          currentMonthIndex: (planData.currentMonthIndex as number) ?? 1,
          assumptions: JSON.stringify((planData.assumptions as unknown[]) ?? []),
          riskNotes: JSON.stringify((planData.riskNotes as unknown[]) ?? []),
          generationMeta: JSON.stringify({ source: "agent_artifact_accept", candidateType }),
        },
      });
      break;
    }

    case "growth_replan": {
      const planPatch = data.planPatch as Record<string, unknown> | undefined;
      const parentPlanId = planPatch?.parentPlanId as string | undefined;
      // 停用当前活动计划
      await tx.careerPlan.updateMany({
        where: { userId, status: "active" },
        data: { status: "inactive" },
      });
      await tx.careerPlan.create({
        data: {
          userId,
          targetRole: String(planPatch?.targetRole ?? data.targetRole ?? "unknown"),
          version: (artifact.baseVersion ?? 1) + 1,
          status: "active",
          schemaVersion: 2,
          content: JSON.stringify(data),
          targetRoleLabel: data.targetRoleLabel ? String(data.targetRoleLabel) : null,
          parentPlanId: parentPlanId ?? null,
          activatedAt: new Date(),
          years: JSON.stringify((data.years as unknown[]) ?? []),
          quarters: JSON.stringify((data.quarters as unknown[]) ?? []),
          months: JSON.stringify((data.months as unknown[]) ?? []),
          currentMonthIndex: (data.currentMonthIndex as number) ?? 1,
          assumptions: JSON.stringify((data.assumptions as unknown[]) ?? []),
          riskNotes: JSON.stringify((data.riskNotes as unknown[]) ?? []),
          generationMeta: JSON.stringify({ source: "agent_artifact_accept", candidateType }),
        },
      });
      break;
    }

    case "learning_route":
      // 标记接受但不执行直接写入——artifact 即权威提案
      break;

    case "memory_item": {
      const content = String(data.content ?? "").slice(0, 2000);
      if (content) {
        await tx.memoryItem.create({
          data: {
            userId,
            content,
            kind: String(data.kind ?? "career_fact"),
            source: "agent",
            sensitivity: "normal",
            status: "confirmed",
            scope: "career",
            reason: String(data.reason ?? "").slice(0, 500),
          },
        });
      }
      break;
    }

    case "career_template_draft": {
      await tx.roleDraft.create({
        data: {
          roleKey: String(data.roleKey ?? ""),
          roleName: String(data.roleName ?? ""),
          category: String(data.category ?? "其他"),
          content: JSON.stringify(data),
          status: "pending",
        },
      });
      break;
    }
  }
}
