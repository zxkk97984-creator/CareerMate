import { getPrisma } from "@/lib/prisma";
import {
  validatedAgentArtifactV1Schema,
  profilePatchDataSchema,
  profileAssessmentDataSchema,
  CANDIDATE_DATA_SCHEMA,
  type AgentArtifactV1,
} from "./contracts";
import type { AgentArtifactCandidateType } from "./candidate-service";

// ── 候选类型白名单 ────────────────────────────────────────
const ALLOWED_CANDIDATE_TYPES = new Set<string>([
  "profile_patch", "profile_assessment", "ability_evidence", "career_plan",
  "learning_route", "growth_replan", "memory_item", "career_template_draft",
]);

const COMPATIBLE_TASK_TYPES: Record<
  AgentArtifactCandidateType,
  readonly AgentArtifactV1["taskType"][]
> = {
  profile_patch: ["profile_assessment"],
  profile_assessment: ["profile_assessment"],
  ability_evidence: ["simulation_report", "resume_review"],
  career_plan: ["career_plan"],
  learning_route: ["learning_route"],
  growth_replan: ["growth_review"],
  memory_item: ["memory_item"],
  career_template_draft: ["career_exploration", "career_template_draft"],
};

// ── 错误类型 ─────────────────────────────────────────────
export class AgentArtifactCandidateResolutionError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number) {
    super(message);
    this.name = "AgentArtifactCandidateResolutionError";
  }
}

// ── 输入输出 ─────────────────────────────────────────────
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

interface ResolutionTx {
  agentArtifactCandidate: {
    findFirst(args: { where: { id: string; userId: string } }): Promise<{ id: string; userId: string; candidateType: string; status: string; artifact: string; baseVersion: number | null; sourceSessionId: string; sourceConversationId: string | null; resolvedAt: Date | null; } | null>;
    updateMany(args: { where: { id: string; status: string }; data: { status: string; resolvedAt: Date } }): Promise<{ count: number }>;
    update(args: { where: { id: string }; data: { status: string; resolvedAt: Date } }): Promise<unknown>;
  };
  careerPlan: {
    findFirst(args: { where: { userId: string; status: string }; orderBy: { version: "desc" } }): Promise<{ id: string; version: number } | null>;
    updateMany(args: { where: { userId: string; status: string }; data: { status: string } }): Promise<unknown>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
  userProfile: {
    findUnique(args: { where: { userId: string } }): Promise<{ version: number } | null>;
    update(args: { where: { userId: string }; data: Record<string, unknown> }): Promise<unknown>;
    updateMany(args: {
      where: { userId: string; version?: number };
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  learningRoute: {
    findFirst(args: { where: { userId: string; status: string }; orderBy: { version: "desc" } }): Promise<{ id: string; version: number } | null>;
    updateMany(args: { where: { userId: string; status: string }; data: { status: string } }): Promise<unknown>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
  abilityEvidence: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
  memoryItem: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
  roleDraft: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
  progressLog?: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
  $transaction<T>(operation: (tx: Omit<ResolutionTx, "$transaction">) => Promise<T>): Promise<T>;
}

// ── 版本化候选类型集合（需要比较计划版本而非画像版本）───
// 注意：learning_route 也在其中——baseVersion 表示 CareerPlan 版本
const PLAN_VERSIONED_TYPES = new Set<AgentArtifactCandidateType>([
  "career_plan", "learning_route", "growth_replan",
]);

const PROFILE_VERSIONED_TYPES = new Set<AgentArtifactCandidateType>([
  "profile_patch", "profile_assessment", "ability_evidence",
]);

// ── 主入口 ───────────────────────────────────────────────
export async function resolveAgentArtifactCandidate(
  input: ResolveAgentArtifactCandidateInput,
  dependencies: { db?: ResolutionTx } = {},
): Promise<ResolvedAgentArtifactCandidate> {
  const db = dependencies.db ?? (getPrisma() as unknown as ResolutionTx);

  return db.$transaction(async (tx) => {
    // 1. 加载候选
    const candidate = await tx.agentArtifactCandidate.findFirst({
      where: { id: input.candidateId, userId: input.userId },
    });
    if (!candidate) {
      throw new AgentArtifactCandidateResolutionError("候选未找到", "CANDIDATE_NOT_FOUND", 404);
    }

    // 2. 白名单校验 candidateType
    if (!ALLOWED_CANDIDATE_TYPES.has(candidate.candidateType)) {
      throw new AgentArtifactCandidateResolutionError("不支持的候选类型", "UNSUPPORTED_CANDIDATE_TYPE", 400);
    }
    const candidateType = candidate.candidateType as AgentArtifactCandidateType;

    // 3. Zod 校验 artifact
    let rawArtifact: unknown;
    try {
      rawArtifact = JSON.parse(candidate.artifact);
    } catch {
      throw new AgentArtifactCandidateResolutionError("候选数据损坏", "CANDIDATE_CORRUPT", 500);
    }
    const artifactResult = validatedAgentArtifactV1Schema.safeParse(rawArtifact);
    if (!artifactResult.success) {
      throw new AgentArtifactCandidateResolutionError("候选数据损坏", "CANDIDATE_CORRUPT", 500);
    }
    const artifact = artifactResult.data;

    if (!COMPATIBLE_TASK_TYPES[candidateType].includes(artifact.taskType)) {
      throw new AgentArtifactCandidateResolutionError(
        "候选类型与任务类型不兼容", "TASK_TYPE_MISMATCH", 400,
      );
    }

    // 4. 已解决 → 幂等或冲突
    const resolvedStatus = candidate.status as "accepted" | "rejected";
    const decisionStatus = input.decision === "accept" ? "accepted" : "rejected";
    if (resolvedStatus === "accepted" || resolvedStatus === "rejected") {
      if (resolvedStatus === decisionStatus) {
        return { id: candidate.id, status: resolvedStatus, candidateType };
      }
      throw new AgentArtifactCandidateResolutionError("候选已被处理，无法更改决定", "CANDIDATE_ALREADY_RESOLVED", 409);
    }

    // 5. 拒绝 → 原子标记
    if (input.decision === "reject") {
      const rejected = await tx.agentArtifactCandidate.updateMany({
        where: { id: candidate.id, status: "pending" },
        data: { status: "rejected", resolvedAt: new Date() },
      });
      if (rejected.count !== 1) {
        throw new AgentArtifactCandidateResolutionError("候选已被处理，无法更改决定", "CANDIDATE_ALREADY_RESOLVED", 409);
      }
      return { id: candidate.id, status: "rejected", candidateType };
    }

    // 6. 接受 → 验证版本
    await validateVersion(tx, input.userId, candidateType, artifact);

    // 7. 严格校验 data
    validateCandidateData(candidateType, artifact.data);

    // 8. 原子 claim（updateMany WHERE status=pending 防并发双重投影）
    const claimed = await tx.agentArtifactCandidate.updateMany({
      where: { id: candidate.id, status: "pending" },
      data: { status: "applying", resolvedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new AgentArtifactCandidateResolutionError("候选已被处理，无法更改决定", "CANDIDATE_ALREADY_RESOLVED", 409);
    }

    // 9. 类型投影
    await applyProjection(tx, input.userId, candidateType, artifact);

    // 10. 标记已接受
    await tx.agentArtifactCandidate.update({
      where: { id: candidate.id },
      data: { status: "accepted", resolvedAt: new Date() },
    });

    return { id: candidate.id, status: "accepted", candidateType };
  });
}

// ── 版本验证 ─────────────────────────────────────────────
async function validateVersion(
  tx: Omit<ResolutionTx, "$transaction">,
  userId: string,
  candidateType: AgentArtifactCandidateType,
  artifact: AgentArtifactV1,
): Promise<void> {
  if (artifact.baseVersion === null || artifact.baseVersion === undefined) return;

  if (PLAN_VERSIONED_TYPES.has(candidateType)) {
    const plan = await tx.careerPlan.findFirst({
      where: { userId, status: "active" },
      orderBy: { version: "desc" },
    });
    if (plan && plan.version !== artifact.baseVersion) {
      throw new AgentArtifactCandidateResolutionError("数据版本已变化，请重新生成候选", "BASE_VERSION_CONFLICT", 409);
    }
  } else if (PROFILE_VERSIONED_TYPES.has(candidateType)) {
    const profile = await tx.userProfile.findUnique({ where: { userId } });
    if (profile && profile.version !== artifact.baseVersion) {
      throw new AgentArtifactCandidateResolutionError("数据版本已变化，请重新生成候选", "BASE_VERSION_CONFLICT", 409);
    }
  }
}

// ── 数据校验 ─────────────────────────────────────────────
function validateCandidateData(
  candidateType: AgentArtifactCandidateType,
  data: unknown,
): void {
  const schema = CANDIDATE_DATA_SCHEMA[candidateType];
  if (!schema) {
    throw new AgentArtifactCandidateResolutionError("不支持的候选类型", "UNSUPPORTED_CANDIDATE_TYPE", 400);
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AgentArtifactCandidateResolutionError(
      `候选数据不符合 ${candidateType} schema`, "INVALID_CANDIDATE_DATA", 400,
    );
  }
}

// ── 类型投影 ─────────────────────────────────────────────
async function applyProjection(
  tx: Omit<ResolutionTx, "$transaction">,
  userId: string,
  candidateType: AgentArtifactCandidateType,
  artifact: AgentArtifactV1,
): Promise<void> {
  const data = artifact.data as Record<string, unknown> | null | undefined;
  if (!data || typeof data !== "object") return;

  switch (candidateType) {
    case "profile_patch": {
      const parsed = profilePatchDataSchema.parse(data);
      const filtered: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(parsed.patch)) {
        if (value === undefined) continue;
        filtered[key] = Array.isArray(value) ? JSON.stringify(value) : value;
      }
      const updated = await tx.userProfile.updateMany({
        where: {
          userId,
          ...(artifact.baseVersion === null ? {} : { version: artifact.baseVersion }),
        },
        data: { ...filtered, version: { increment: 1 } },
      });
      if (updated.count !== 1) {
        throw new AgentArtifactCandidateResolutionError(
          "数据版本已变化，请重新生成候选", "BASE_VERSION_CONFLICT", 409,
        );
      }
      break;
    }

    case "profile_assessment": {
      const parsed = profileAssessmentDataSchema.parse(data);

      // 1. 先读取当前画像，合并 abilityScores
      const profile = await tx.userProfile.findUnique({ where: { userId } });
      const currentScores: Record<string, number> = {};
      try {
        if (profile) {
          const raw = JSON.parse(
            (profile as unknown as Record<string, unknown>).abilityScores as string ?? "{}",
          );
          if (raw && typeof raw === "object" && !Array.isArray(raw)) {
            Object.assign(currentScores, raw);
          }
        }
      } catch { /* 忽略损坏的能力分数 */ }
      if (parsed.scores) {
        for (const [key, entry] of Object.entries(parsed.scores)) {
          currentScores[key] = entry.value;
        }
      }

      // 2. 构建合并数据（patch 字段 + merged scores）
      const mergedData: Record<string, unknown> = {};
      if (parsed.patch) {
        for (const [key, value] of Object.entries(parsed.patch)) {
          if (value === undefined) continue;
          mergedData[key] = Array.isArray(value) ? JSON.stringify(value) : value;
        }
      }
      // 包含 abilityScores（无论是否变更，确保持久化）
      mergedData.abilityScores = JSON.stringify(currentScores);

      // 3. 统一 CAS：所有 profile_assessment 都执行一次 updateMany
      //    包括 evidence-only——必须递增版本以防同一 baseVersion 反复接受
      const updated = await tx.userProfile.updateMany({
        where: {
          userId,
          ...(artifact.baseVersion === null ? {} : { version: artifact.baseVersion }),
        },
        data: { ...mergedData, version: { increment: 1 } },
      });
      if (updated.count !== 1) {
        throw new AgentArtifactCandidateResolutionError(
          "数据版本已变化，请重新生成候选", "BASE_VERSION_CONFLICT", 409,
        );
      }

      // 4. CAS 成功后，在同一事务写能力证据
      const allEvidence: Array<{
        abilityKey: string; summary: string; sourceType: string;
        sourceRef?: string; confidence: number;
      }> = [...(parsed.abilityEvidence ?? [])];
      if (parsed.scores) {
        for (const [key, entry] of Object.entries(parsed.scores)) {
          allEvidence.push({
            abilityKey: key,
            summary: entry.evidence,
            sourceType: "profile_assessment",
            confidence: entry.confidence ?? 0.7,
          });
        }
      }
      for (const item of allEvidence) {
        await tx.abilityEvidence.create({
          data: {
            userId,
            abilityKey: item.abilityKey,
            summary: item.summary,
            sourceType: item.sourceType,
            sourceRef: item.sourceRef ?? null,
            confidence: item.confidence,
            status: "confirmed",
          },
        });
      }
      break;
    }

    case "ability_evidence": {
      const items = data.abilityEvidence as Array<{
        abilityKey: string; summary: string; sourceType: string;
        sourceRef?: string; confidence: number;
      }>;
      for (const item of items) {
        await tx.abilityEvidence.create({
          data: {
            userId,
            abilityKey: item.abilityKey,
            summary: item.summary,
            sourceType: item.sourceType,
            sourceRef: item.sourceRef ?? null,
            confidence: item.confidence,
            status: "confirmed",
          },
        });
      }
      break;
    }

    case "career_plan":
    case "growth_replan": {
      const plan = (data as Record<string, unknown>).plan as Record<string, unknown> | undefined;
      const targetRole = (plan?.targetRole as Record<string, unknown> | undefined);
      const planPatch = candidateType === "growth_replan"
        ? (data as Record<string, unknown>).planPatch as Record<string, unknown> | undefined
        : undefined;
      const parentPlanId = planPatch?.parentPlanId ? String(planPatch.parentPlanId) : null;

      const phases = (plan?.phases as Array<Record<string, unknown>> | undefined) ?? [];
      const years = phases.slice(0, 3).map((p, i) => ({
        yearIndex: i + 1,
        goal: String(p.objective ?? p.title ?? ""),
        expectedOutputs: (p.outputs as string[] | undefined) ?? [],
      }));
      const quarters = phases.slice(0, 12).map((p, i) => ({
        quarterIndex: i + 1,
        goal: String(p.objective ?? p.title ?? ""),
        milestone: String(p.title ?? ""),
        evaluation: String((p.evaluationCriteria as string[] | undefined)?.[0] ?? ""),
      }));
      const months: Array<Record<string, unknown>> = [];
      for (const phase of phases) {
        for (const action of (phase.actions as Array<Record<string, unknown>> | undefined) ?? []) {
          months.push({
            monthIndex: months.length + 1,
            goal: String(action.title ?? ""),
            learningTasks: [{ id: `task_m${months.length + 1}_1`, title: String(action.title ?? ""), type: action.type ?? "learning", status: "not_started", dueWeek: 2 }],
            practiceOutputs: [String(action.description ?? "")],
            evaluationMetrics: ["是否按时完成"],
          });
        }
      }

      await tx.careerPlan.updateMany({
        where: { userId, status: "active" },
        data: { status: "inactive" },
      });
      await tx.careerPlan.create({
        data: {
          userId,
          targetRole: String(targetRole?.key ?? "unknown"),
          version: (artifact.baseVersion ?? 1) + 1,
          status: "active",
          schemaVersion: 2,
          content: JSON.stringify(plan ?? data),
          targetRoleLabel: targetRole?.label ? String(targetRole.label) : null,
          parentPlanId: parentPlanId || null,
          activatedAt: new Date(),
          years: JSON.stringify(years),
          quarters: JSON.stringify(quarters),
          months: JSON.stringify(months),
          currentMonthIndex: 1,
          assumptions: JSON.stringify((plan?.assumptions as unknown[]) ?? []),
          riskNotes: JSON.stringify((plan?.riskNotes as unknown[]) ?? []),
          generationMeta: JSON.stringify({ source: "agent_artifact_accept", candidateType }),
        },
      });
      break;
    }

    case "learning_route": {
      // ── 权威存储：写入独立 LearningRoute 模型 ──
      // 不修改 CareerPlan——职业规划和学习路线独立版本化

      // 获取当前 active 职业规划作为关联
      const activePlan = await tx.careerPlan.findFirst({
        where: { userId, status: "active" },
        orderBy: { version: "desc" },
      });

      // 1. 先读取当前 active LearningRoute（归档前读取，否则永远为 null）
      const currentRoute = await tx.learningRoute.findFirst({
        where: { userId, status: "active" },
        orderBy: { version: "desc" },
      });

      // 2. 验证 LearningRoute 自身版本冲突
      //    baseRouteVersion 记录生成候选时的当前路线版本
      const baseRouteVersion = data.baseRouteVersion;
      const routeVersionMatches = currentRoute
        ? baseRouteVersion === currentRoute.version
        : baseRouteVersion === null;
      if (!routeVersionMatches) {
        throw new AgentArtifactCandidateResolutionError(
          "学习路线版本已变化，请重新生成候选", "BASE_VERSION_CONFLICT", 409,
        );
      }

      // 3. 计算新版本号
      const newVersion = (currentRoute?.version ?? 0) + 1;

      // 4. 归档旧 LearningRoute
      await tx.learningRoute.updateMany({
        where: { userId, status: "active" },
        data: { status: "inactive" },
      });

      // 5. 创建新 LearningRoute
      const targetRole = typeof data.targetRole === "string" ? data.targetRole : "unknown";
      const routeContent = {
        schemaVersion: 1,
        targetRole: data.targetRole,
        weeklyBudgetHours: data.weeklyBudgetHours,
        period: data.period,
        stages: data.stages,
        tasks: data.tasks,
        resources: data.resources,
        deliverables: data.deliverables,
        acceptanceCriteria: data.acceptanceCriteria,
        adjustmentTriggers: data.adjustmentTriggers,
      };

      await tx.learningRoute.create({
        data: {
          userId,
          relatedPlanId: activePlan?.id ?? null,
          version: newVersion,
          status: "active",
          schemaVersion: 1,
          content: JSON.stringify(routeContent),
          basePlanVersion: activePlan?.version ?? null,
        },
      });

      // ProgressLog 仅做审计记录
      const weeklyHours = typeof data.weeklyBudgetHours === "number" ? `${data.weeklyBudgetHours}h/周` : "";
      const stages = Array.isArray(data.stages) ? data.stages : [];
      const tasks = Array.isArray(data.tasks) ? data.tasks : [];
      if (tx.progressLog) {
        await tx.progressLog.create({
          data: {
            userId,
            eventType: "learning_route_accepted",
            title: `采纳学习路线：${targetRole}`,
            summary: [
              weeklyHours,
              typeof data.period === "string" ? data.period : "",
              `${stages.length} 阶段, ${tasks.length} 任务`,
            ].filter(Boolean).join("；") || `已确认 ${targetRole} 学习路线`,
            metadata: JSON.stringify({
              source: "agent_artifact_accept",
              candidateType,
              targetRole,
              relatedPlanId: activePlan?.id ?? null,
              learningRouteVersion: newVersion,
              stagesCount: stages.length,
              tasksCount: tasks.length,
            }),
          },
        });
      }
      break;
    }

    case "memory_item": {
      const content = String(data.content).slice(0, 2000);
      if (content) {
        const rawSensitivity = String(data.sensitivity ?? "");
        const sensitivity = rawSensitivity === "sensitive" ? "sensitive" : "normal";
        await tx.memoryItem.create({
          data: {
            userId,
            content,
            kind: String(data.kind ?? "career_fact"),
            source: "agent",
            sensitivity,
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
          roleKey: String(data.roleKey),
          roleName: String(data.roleName),
          category: String(data.category ?? "其他"),
          content: JSON.stringify(data),
          status: "pending",
        },
      });
      break;
    }
  }
}
