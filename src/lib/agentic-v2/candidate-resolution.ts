import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { agentArtifactV1Schema, type AgentArtifactV1 } from "./contracts";
import type { AgentArtifactCandidateType } from "./candidate-service";

// ── 候选类型白名单 ────────────────────────────────────────
const ALLOWED_CANDIDATE_TYPES = new Set<string>([
  "profile_patch", "ability_evidence", "career_plan", "learning_route",
  "growth_replan", "memory_item", "career_template_draft",
]);

const COMPATIBLE_TASK_TYPES: Record<
  AgentArtifactCandidateType,
  readonly AgentArtifactV1["taskType"][]
> = {
  profile_patch: ["profile_assessment"],
  ability_evidence: ["profile_assessment", "simulation_report", "resume_review", "growth_review"],
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

// ── 按候选类型的严格数据 Schema ─────────────────────────
const profilePatchSchema = z.object({
  targetRole: z.string().trim().min(1).max(160).nullable().optional(),
  targetRoleLabel: z.string().trim().min(1).max(200).nullable().optional(),
  weeklyAvailableHours: z.number().int().min(1).max(168).nullable().optional(),
  educationStage: z.string().trim().min(1).max(120).nullable().optional(),
  major: z.string().trim().min(1).max(160).nullable().optional(),
  learningPreference: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  experienceSummary: z.string().trim().max(2_000).optional(),
  interestTags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  constraints: z.array(z.string().trim().min(1).max(240)).max(12).optional(),
}).strict().refine(
  (patch) => Object.values(patch).some((value) => value !== undefined),
  { message: "补丁不能为空" },
);

const profilePatchDataSchema = z.object({
  patch: profilePatchSchema,
}).strict();

const confidenceSchema = z.number().min(0).max(1);

const abilityEvidenceItemSchema = z.object({
  abilityKey: z.string().trim().min(1),
  summary: z.string().trim().min(1).max(500),
  sourceType: z.string().trim().min(1),
  sourceRef: z.string().trim().optional(),
  confidence: confidenceSchema,
}).strict();

const abilityEvidenceDataSchema = z.object({
  abilityEvidence: z.array(abilityEvidenceItemSchema).min(1),
}).strict();

const careerPlanDataSchema = z.object({
  targetRole: z.string().trim().min(1).max(160),
  phases: z.array(z.unknown()).optional(),
  summary: z.string().trim().optional(),
  immediateActions: z.array(z.unknown()).optional(),
  years: z.array(z.unknown()).optional(),
  quarters: z.array(z.unknown()).optional(),
  months: z.array(z.unknown()).optional(),
  currentMonthIndex: z.number().int().optional(),
  assumptions: z.array(z.unknown()).optional(),
  riskNotes: z.array(z.unknown()).optional(),
  targetRoleLabel: z.string().trim().optional(),
});

const growthReplanDataSchema = careerPlanDataSchema.extend({
  planPatch: z.object({
    parentPlanId: z.string().trim().min(1).optional(),
    targetRole: z.string().trim().min(1).optional(),
  }).optional(),
});

const memoryItemDataSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  kind: z.string().trim().min(1).max(40),
  reason: z.string().trim().max(500).optional(),
}).strict();

const careerTemplateDraftDataSchema = z.object({
  roleKey: z.string().trim().min(1).max(160),
  roleName: z.string().trim().min(1).max(200),
  category: z.string().trim().max(40).optional(),
}).strict();

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
  abilityEvidence: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
  memoryItem: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
  roleDraft: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
  $transaction<T>(operation: (tx: Omit<ResolutionTx, "$transaction">) => Promise<T>): Promise<T>;
}

// ── 版本化候选类型集合（需要比较计划版本而非画像版本）───
const PLAN_VERSIONED_TYPES = new Set<AgentArtifactCandidateType>([
  "career_plan", "learning_route", "growth_replan",
]);

const PROFILE_VERSIONED_TYPES = new Set<AgentArtifactCandidateType>([
  "profile_patch", "ability_evidence",
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
      throw new AgentArtifactCandidateResolutionError(
        "候选数据损坏",
        "CANDIDATE_CORRUPT",
        500,
      );
    }
    const artifactResult = agentArtifactV1Schema.safeParse(rawArtifact);
    if (!artifactResult.success) {
      throw new AgentArtifactCandidateResolutionError("候选数据损坏", "CANDIDATE_CORRUPT", 500);
    }
    const artifact = artifactResult.data;

    if (!COMPATIBLE_TASK_TYPES[candidateType].includes(artifact.taskType)) {
      throw new AgentArtifactCandidateResolutionError(
        "候选类型与任务类型不兼容",
        "TASK_TYPE_MISMATCH",
        400,
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
  let result;
  switch (candidateType) {
    case "profile_patch":
      result = profilePatchDataSchema.safeParse(data);
      break;
    case "ability_evidence":
      result = abilityEvidenceDataSchema.safeParse(data);
      break;
    case "career_plan":
      result = careerPlanDataSchema.safeParse(data);
      break;
    case "learning_route":
      result = z.object({}).passthrough().safeParse(data); // 自由格式但必须为对象
      break;
    case "growth_replan":
      result = growthReplanDataSchema.safeParse(data);
      break;
    case "memory_item":
      result = memoryItemDataSchema.safeParse(data);
      break;
    case "career_template_draft":
      result = careerTemplateDraftDataSchema.safeParse(data);
      break;
    default:
      throw new AgentArtifactCandidateResolutionError("不支持的候选类型", "UNSUPPORTED_CANDIDATE_TYPE", 400);
  }
  if (result && !result.success) {
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
          "数据版本已变化，请重新生成候选",
          "BASE_VERSION_CONFLICT",
          409,
        );
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

    case "career_plan": {
      await tx.careerPlan.updateMany({
        where: { userId, status: "active" },
        data: { status: "inactive" },
      });
      await tx.careerPlan.create({
        data: {
          userId,
          targetRole: String(data.targetRole ?? "unknown"),
          version: (artifact.baseVersion ?? 1) + 1,
          status: "active",
          schemaVersion: 2,
          content: JSON.stringify(data),
          targetRoleLabel: data.targetRoleLabel ? String(data.targetRoleLabel) : null,
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

    case "growth_replan": {
      const parentPlanId = data.planPatch && typeof data.planPatch === "object"
        ? String((data.planPatch as Record<string, unknown>).parentPlanId ?? "")
        : null;
      await tx.careerPlan.updateMany({
        where: { userId, status: "active" },
        data: { status: "inactive" },
      });
      await tx.careerPlan.create({
        data: {
          userId,
          targetRole: String(data.targetRole ?? "unknown"),
          version: (artifact.baseVersion ?? 1) + 1,
          status: "active",
          schemaVersion: 2,
          content: JSON.stringify(data),
          targetRoleLabel: data.targetRoleLabel ? String(data.targetRoleLabel) : null,
          parentPlanId: parentPlanId || null,
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
      // 标记接受但不执行直接写入
      break;

    case "memory_item": {
      const content = String(data.content).slice(0, 2000);
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
