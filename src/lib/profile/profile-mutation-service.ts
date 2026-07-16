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

      // 验证 evidenceExcerpt：explicit 必须有在当前原文中的证据
      if (sourceKind === "explicit") {
        if (!evidenceExcerpt || evidenceExcerpt.trim().length === 0) {
          return { action: "pending_candidate", reason: "explicit_requires_evidence_excerpt" };
        }
        if (userMessage && !userMessage.includes(evidenceExcerpt.trim())) {
          return { action: "pending_candidate", reason: "evidence_not_in_user_message" };
        }
      }

      // 加载当前画像，判断是否有冲突
      const profile = await db.userProfile.findUnique({
        where: { userId: input.userId },
      });

      if (!profile) {
        // 无画像时仍可创建候选（新用户首次使用场景）
        if (sourceKind === "explicit" && evidenceExcerpt && evidenceExcerpt.trim().length > 0) {
          return { action: "pending_candidate", reason: "new_user_profile_patch" };
        }
        return { action: "no_op", reason: "no_profile" };
      }

      // 检查 targetRole 变更——支持 {key,label} 对象和字符串两种格式
      if (patch.targetRole !== undefined && patch.targetRole !== null) {
        const newKey = typeof patch.targetRole === "object" && patch.targetRole !== null
          ? (patch.targetRole as Record<string, unknown>).key as string | undefined
          : String(patch.targetRole);
        const newLabel = typeof patch.targetRole === "object" && patch.targetRole !== null
          ? (patch.targetRole as Record<string, unknown>).label as string | undefined
          : undefined;
        if (!newKey) return { action: "no_op", reason: "invalid_target_role_format" };
        if (profile.targetRole && profile.targetRole !== newKey) {
          return { action: "pending_candidate", reason: "target_role_change_requires_confirmation" };
        }
        if (!profile.targetRole) {
          return { action: "auto_apply", reason: "empty_target_role_filled" };
        }
        if (profile.targetRole === newKey) {
          // key 相同但 label 可能不同 → 更新 label
          if (newLabel && profile.targetRoleLabel !== newLabel) {
            return { action: "auto_apply", reason: "target_role_label_updated" };
          }
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
      if (patch.interestTags !== undefined) data.interestTags = JSON.stringify(patch.interestTags);

      const updated = await db.userProfile.update({
        where: { userId },
        data: { ...data, version: { increment: 1 } },
      });

      return { version: updated.version };
    },

    async createCandidate(input) {
      // 读取当前 profile version 作为 baseProfileVersion
      const profile = await db.userProfile.findUnique({
        where: { userId: input.userId },
        select: { version: true },
      });
      // 确定实际字段名——从 patch 的第一个 key 提取
      const patchObj = input.patch as Record<string, unknown>;
      const fieldKeys = Object.keys(patchObj);
      const field = fieldKeys.length === 1 ? fieldKeys[0] : "patch";
      const newValue = fieldKeys.length === 1 ? patchObj[fieldKeys[0]] : JSON.stringify(patchObj);

      const candidate = await db.profileUpdateCandidate.create({
        data: {
          userId: input.userId,
          source: "agent_operation",
          field,
          oldValue: "null",
          newValue: typeof newValue === "string" ? newValue : JSON.stringify(newValue),
          confidence: input.confidence,
          requiresConfirmation: true,
          reason: input.reason,
          sourceConversationId: input.conversationId,
          evidenceExcerpt: input.evidenceExcerpt,
          patch: JSON.stringify(input.patch),
          baseProfileVersion: profile?.version ?? null,
          status: "pending",
        },
      });

      return { candidateId: candidate.id };
    },
  };
}
