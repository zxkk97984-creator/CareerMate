import { getPrisma } from "@/lib/prisma";
import { parseJson, toJson } from "@/lib/json";
import type { AbilityScores } from "@/lib/types";
import { abilityKeys } from "@/lib/types";

// ── 字段白名单 ──────────────────────────────────────────

/** 允许 AI 候选修改的画像字段白名单 */
export const ALLOWED_CANDIDATE_FIELDS = new Set([
  "educationStage",
  "major",
  "targetRole",
  "targetRoleLabel",
  "weeklyAvailableHours",
  "learningPreference",
  "experienceSummary",
  "interestTags",
  "constraints",
  "abilityScores.aiTooling",
  "abilityScores.roleFoundation",
  "abilityScores.dataAnalysis",
  "abilityScores.businessProduct",
  "abilityScores.communication",
  "abilityScores.projectPractice",
]);

// ── 错误 ────────────────────────────────────────────────

export class CandidateServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
    this.name = "CandidateServiceError";
  }
}

// ── 服务接口 ────────────────────────────────────────────

export type CandidateAction = "accept" | "edit" | "reject";

export interface ProcessResult {
  id: string;
  status: string;
  field: string;
  newValue: unknown;
}

export interface CandidateService {
  processCandidate(
    candidateId: string,
    userId: string,
    action: CandidateAction,
    field?: string,
    newValue?: string,
  ): Promise<ProcessResult>;
}

// ── 实现 ────────────────────────────────────────────────

export function createCandidateService(): CandidateService {
  const db = getPrisma();

  async function getCandidate(candidateId: string, userId: string) {
    return db.profileUpdateCandidate.findFirst({
      where: { id: candidateId, userId },
    });
  }

  async function getProfile(userId: string) {
    return db.userProfile.findUnique({ where: { userId } });
  }

  async function getEvidence(evidenceId: string | null) {
    if (!evidenceId) return null;
    return db.abilityEvidence.findUnique({ where: { id: evidenceId } });
  }

  return {
    async processCandidate(candidateId, userId, action, field, newValue) {
      // 1. 获取候选，校验所有权和状态
      const candidate = await getCandidate(candidateId, userId);
      if (!candidate) {
        throw new CandidateServiceError("画像更新候选不存在", "NOT_FOUND", 404);
      }

      if (candidate.status !== "pending") {
        throw new CandidateServiceError(
          "该候选已经处理过",
          "ALREADY_PROCESSED",
          409,
        );
      }

      const targetField = field ?? candidate.field;

      // 2. 白名单校验
      if (!ALLOWED_CANDIDATE_FIELDS.has(targetField)) {
        throw new CandidateServiceError("不允许修改该字段", "FIELD_NOT_ALLOWED", 400);
      }

      // 3. reject：只更新状态，不修改画像和证据
      if (action === "reject") {
        const updated = await db.profileUpdateCandidate.update({
          where: { id: candidateId },
          data: { status: "rejected" },
        });
        return {
          id: updated.id,
          status: updated.status,
          field: updated.field,
          newValue: parseJson(updated.newValue, null),
        };
      }

      // 4. accept 或 edit：需要更新画像
      const profile = await getProfile(userId);
      if (!profile) {
        throw new CandidateServiceError("用户画像不存在", "NOT_FOUND", 404);
      }

      const resolvedValue =
        action === "edit" && newValue !== undefined
          ? newValue
          : candidate.newValue;

      // 5. 结构化值校验——必须能解析为合法 JSON
      const parsed = parseJson<unknown>(resolvedValue, undefined);
      if (parsed === undefined) {
        throw new CandidateServiceError("候选值不合法", "INVALID_VALUE", 400);
      }

      // 6. 根据字段类型更新画像
      if (targetField.startsWith("abilityScores.")) {
        const abilityKey = targetField.split(".")[1];
        if (!abilityKeys.includes(abilityKey as (typeof abilityKeys)[number])) {
          throw new CandidateServiceError(
            `无效的能力维度: ${abilityKey}`,
            "INVALID_ABILITY_KEY",
            400,
          );
        }
        const score = Number(parsed);
        if (!Number.isFinite(score) || score < 0 || score > 100) {
          throw new CandidateServiceError(
            "能力分必须在0到100之间",
            "INVALID_SCORE",
            400,
          );
        }

        const currentScores = parseJson<AbilityScores>(profile.abilityScores, {
          aiTooling: 0,
          roleFoundation: 0,
          dataAnalysis: 0,
          businessProduct: 0,
          communication: 0,
          projectPractice: 0,
        });
        currentScores[abilityKey as keyof AbilityScores] = score;

        await db.userProfile.update({
          where: { userId },
          data: { abilityScores: toJson(currentScores) },
        });
      } else {
        // 直接字段更新：字符串直接写入，其他类型 JSON 序列化
        const updateData: Record<string, unknown> = {};
        updateData[targetField] =
          typeof parsed === "string" ? parsed : toJson(parsed);
        await db.userProfile.update({
          where: { userId },
          data: updateData,
        });
      }

      // 7. 关联证据变 confirmed
      if (candidate.abilityEvidenceId) {
        const evidence = await getEvidence(candidate.abilityEvidenceId);
        if (evidence && evidence.status === "pending") {
          await db.abilityEvidence.update({
            where: { id: candidate.abilityEvidenceId },
            data: { status: "confirmed" },
          });
        }
      }

      // 8. 更新候选状态
      const updated = await db.profileUpdateCandidate.update({
        where: { id: candidateId },
        data: {
          status: "accepted",
          ...(action === "edit" ? { newValue: resolvedValue } : {}),
        },
      });

      return {
        id: updated.id,
        status: updated.status,
        field: updated.field,
        newValue: parseJson(
          action === "edit" ? resolvedValue : updated.newValue,
          null,
        ),
      };
    },
  };
}
