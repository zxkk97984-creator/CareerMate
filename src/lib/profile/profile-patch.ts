import { z } from "zod";

/**
 * 原子画像 patch Schema。
 *
 * 约束：
 * - targetRole 作为 key+label 对象，成对更新
 * - 禁止写入 passwordHash、ssn 等敏感字段
 * - 每个字段有长度/范围限制
 */

export const profilePatchSchema = z.object({
  educationStage: z.string().trim().min(1).max(120).nullable().optional(),
  major: z.string().trim().min(1).max(160).nullable().optional(),
  targetRole: z.object({
    key: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(160),
  }).nullable().optional(),
  weeklyAvailableHours: z.number().int().min(1).max(168).nullable().optional(),
  learningPreference: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  experienceSummary: z.string().trim().max(2000).optional(),
  interestTags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  constraints: z.array(z.string().trim().min(1).max(240)).max(12).optional(),
}).strict();

export type ProfilePatch = z.infer<typeof profilePatchSchema>;

/** 敏感的/禁止写入的字段名 */
export const BLOCKED_PATCH_FIELDS = new Set([
  "passwordHash",
  "ssn",
  "idNumber",
  "bankAccount",
  "phoneNumber",
  "email",
  "address",
]);

/** 判断 patch 是否为合法可执行操作 */
export function isValidProfilePatch(patch: unknown): patch is ProfilePatch {
  return profilePatchSchema.safeParse(patch).success;
}

/** 判断是否为空 patch（无实际变更） */
export function isEmptyPatch(patch: ProfilePatch): boolean {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  return entries.length === 0;
}
