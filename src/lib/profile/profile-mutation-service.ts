import { getPrisma } from "@/lib/prisma";
import type { ProfilePatch } from "./profile-patch";
import { profilePatchSchema, isEmptyPatch } from "./profile-patch";

// ── 类型 ────────────────────────────────────────

export type MutationDecision =
  | { action: "auto_apply"; reason: string }
  | { action: "pending_candidate"; reason: string }
  | { action: "no_op"; reason: string };

export interface ProfileMutationInput {
  userId: string;
  conversationId?: string;
  patch: ProfilePatch;
  sourceKind: "explicit" | "inferred";
  confidence: number;
  evidenceExcerpt: string;
  reason: string;
  sensitive: boolean;
  /** 当前轮次的用户原文，用于匹配 evidenceExcerpt */
  userMessage?: string;
}

// ── 服务 ────────────────────────────────────────

export interface ProfileMutationService {
  /** 判断 patch 应自动写入、pending candidate 还是 no-op */
  decide(input: ProfileMutationInput): Promise<MutationDecision>;
  /** 自动应用 patch（仅在 auto_apply 时调用） */
  applyPatch(userId: string, patch: ProfilePatch): Promise<{ version: number }>;
  /** 创建 pending candidate */
  createCandidate(input: ProfileMutationInput): Promise<{ candidateId: string }>;
}

export function createProfileMutationService(): ProfileMutationService {
  const db = getPrisma();

  return {
    async decide(input) {
      const { patch, sourceKind, evidenceExcerpt, userMessage, sensitive } = input;

      // 验证 patch
      if (!profilePatchSchema.safeParse(patch).success) {
        return { action: "no_op", reason: "invalid_patch_schema" };
      }

      if (isEmptyPatch(patch)) {
        return { action: "no_op", reason: "empty_patch" };
      }

      // 敏感内容 → pending
      if (sensitive) {
        return { action: "pending_candidate", reason: "sensitive_content_requires_confirmation" };
      }

      // 推断内容 → pending
      if (sourceKind === "inferred") {
        return { action: "pending_candidate", reason: "inferred_content_requires_confirmation" };
      }

      // 验证 evidenceExcerpt 在当前原文中
      if (userMessage && evidenceExcerpt) {
        if (!userMessage.includes(evidenceExcerpt)) {
          return { action: "pending_candidate", reason: "evidence_not_in_user_message" };
        }
      }

      // 加载当前画像，判断是否有冲突
      const profile = await db.userProfile.findUnique({
        where: { userId: input.userId },
      });

      if (!profile) {
        return { action: "no_op", reason: "no_profile" };
      }

      // 检查 targetRole 变更（需要确认）
      if (patch.targetRole !== undefined && patch.targetRole !== null) {
        if (profile.targetRole && profile.targetRole !== patch.targetRole.key) {
          return { action: "pending_candidate", reason: "target_role_change_requires_confirmation" };
        }
        // 空字段 + explicit → auto
        if (!profile.targetRole) {
          return { action: "auto_apply", reason: "empty_target_role_filled" };
        }
        // 同值 → no-op
        if (profile.targetRole === patch.targetRole.key) {
          return { action: "no_op", reason: "same_target_role" };
        }
      }

      // 检查 weeklyAvailableHours 变更
      if (patch.weeklyAvailableHours !== undefined && patch.weeklyAvailableHours !== null) {
        if (profile.weeklyAvailableHours && profile.weeklyAvailableHours !== patch.weeklyAvailableHours) {
          return { action: "pending_candidate", reason: "hours_change_requires_confirmation" };
        }
        if (!profile.weeklyAvailableHours) {
          return { action: "auto_apply", reason: "empty_hours_filled" };
        }
        if (profile.weeklyAvailableHours === patch.weeklyAvailableHours) {
          return { action: "no_op", reason: "same_hours" };
        }
      }

      // 空字段 + explicit + 非敏感 → auto apply
      const emptyFields: string[] = [];
      if (patch.educationStage && !profile.educationStage) emptyFields.push("educationStage");
      if (patch.major && !profile.major) emptyFields.push("major");
      if (patch.experienceSummary && !profile.experienceSummary) emptyFields.push("experienceSummary");
      if (patch.learningPreference && profile.learningPreference === "[]") emptyFields.push("learningPreference");
      if (patch.constraints && profile.constraints === "[]") emptyFields.push("constraints");

      if (emptyFields.length > 0) {
        return { action: "auto_apply", reason: `empty_fields_filled: ${emptyFields.join(",")}` };
      }

      // 非空字段的变更 → pending
      return { action: "pending_candidate", reason: "existing_field_change_requires_confirmation" };
    },

    async applyPatch(userId, patch) {
      const data: Record<string, unknown> = {};

      if (patch.educationStage !== undefined) data.educationStage = patch.educationStage;
      if (patch.major !== undefined) data.major = patch.major;
      if (patch.targetRole !== undefined) {
        data.targetRole = patch.targetRole?.key ?? null;
        data.targetRoleLabel = patch.targetRole?.label ?? null;
      }
      if (patch.weeklyAvailableHours !== undefined) data.weeklyAvailableHours = patch.weeklyAvailableHours;
      if (patch.learningPreference !== undefined) data.learningPreference = JSON.stringify(patch.learningPreference);
      if (patch.experienceSummary !== undefined) data.experienceSummary = patch.experienceSummary;
      if (patch.constraints !== undefined) data.constraints = JSON.stringify(patch.constraints);

      const updated = await db.userProfile.update({
        where: { userId },
        data: { ...data, version: { increment: 1 } },
      });

      return { version: updated.version };
    },

    async createCandidate(input) {
      const candidate = await db.profileUpdateCandidate.create({
        data: {
          userId: input.userId,
          source: "agent_operation",
          field: "patch",
          oldValue: "null",
          newValue: JSON.stringify(input.patch),
          confidence: input.confidence,
          requiresConfirmation: true,
          reason: input.reason,
          sourceConversationId: input.conversationId,
          evidenceExcerpt: input.evidenceExcerpt,
          patch: JSON.stringify(input.patch),
          baseProfileVersion: undefined,
          status: "pending",
        },
      });

      return { candidateId: candidate.id };
    },
  };
}
