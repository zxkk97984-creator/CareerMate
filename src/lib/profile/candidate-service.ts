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

function validatedProfileValue(field: string, value: unknown) {
  if (field === "weeklyAvailableHours") {
    if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 168) {
      throw new CandidateServiceError(
        "每周可投入时间必须是1到168之间的整数",
        "INVALID_VALUE",
        400,
      );
    }
    return value;
  }
  if (["learningPreference", "interestTags", "constraints"].includes(field)) {
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
      throw new CandidateServiceError("该字段必须是字符串数组", "INVALID_VALUE", 400);
    }
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new CandidateServiceError("该字段必须是非空文本", "INVALID_VALUE", 400);
  }
  return value.trim();
}

// ── 实现 ────────────────────────────────────────────────

export function createCandidateService(): CandidateService {
  const db = getPrisma();

  return {
    async processCandidate(candidateId, userId, action, field, newValue) {
      return db.$transaction(async (transaction) => {
        const candidate = await transaction.profileUpdateCandidate.findFirst({
          where: { id: candidateId, userId },
        });
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
        if (!ALLOWED_CANDIDATE_FIELDS.has(targetField)) {
          throw new CandidateServiceError("不允许修改该字段", "FIELD_NOT_ALLOWED", 400);
        }

        if (action === "reject") {
          const updated = await transaction.profileUpdateCandidate.update({
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

        const profile = await transaction.userProfile.findUnique({ where: { userId } });
        if (!profile) {
          throw new CandidateServiceError("用户画像不存在", "NOT_FOUND", 404);
        }

        const resolvedValue =
          action === "edit" && newValue !== undefined ? newValue : candidate.newValue;
        const parsed = parseJson<unknown>(resolvedValue, undefined);
        if (parsed === undefined) {
          throw new CandidateServiceError("候选值不合法", "INVALID_VALUE", 400);
        }

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
          await transaction.userProfile.update({
            where: { userId },
            data: { abilityScores: toJson(currentScores) },
          });
        } else {
          const validated = validatedProfileValue(targetField, parsed);
          const updateData: Record<string, unknown> = {
            [targetField]: Array.isArray(validated) ? toJson(validated) : validated,
          };
          await transaction.userProfile.update({
            where: { userId },
            data: updateData,
          });
        }

        if (candidate.abilityEvidenceId) {
          const evidence = await transaction.abilityEvidence.findUnique({
            where: { id: candidate.abilityEvidenceId },
          });
          if (evidence?.status === "pending") {
            await transaction.abilityEvidence.update({
              where: { id: candidate.abilityEvidenceId },
              data: { status: "confirmed" },
            });
          }
        }

        const updated = await transaction.profileUpdateCandidate.update({
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
      });
    },
  };
}
