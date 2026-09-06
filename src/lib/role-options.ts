import { seedRoleKeys } from "@/lib/types";

/**
 * T16a 资源岗位选项：不再只维护三项 roleLabels，改为由
 * 种子模板 + 当前画像 targetRole + 资源中实际出现的 roleKey 共同构成。
 * 未知/自定义岗位显示可读名称（derived label），不会出现空 option；允许清筛选。
 */

/** 种子岗位的可读名称（与 onboarding / identity 保持一致） */
export const seedRoleLabels: Record<string, string> = {
  database_administrator: "数据库管理员（DBA）",
  ai_product_manager: "AI 产品经理",
  data_analyst: "数据分析师",
  aigc_operator: "AIGC 内容运营",
};

/**
 * 计算一个 roleKey 的可读名称。永不返回空字符串：
 * - 已知种子岗位 → 规范名称；
 * - 等于当前画像 targetRole 的自定义岗位 → 用画像的 targetRoleLabel；
 * - 其余未知 key → 由 stableCustomRoleKey 还原出的原始名称，或回退为 key 本身。
 */
export function roleLabelFor(roleKey: string, profile?: { targetRole?: string | null; targetRoleLabel?: string | null }): string {
  if (!roleKey) return "";
  const seed = seedRoleLabels[roleKey];
  if (seed) return seed;
  if (profile?.targetRole && roleKey === profile.targetRole && profile.targetRoleLabel?.trim()) {
    return profile.targetRoleLabel.trim();
  }
  // 尝试还原 custom 前缀的原始名称；失败则回退为 key
  const customPrefix = "custom_";
  if (roleKey.startsWith(customPrefix)) {
    const rest = roleKey.slice(customPrefix.length);
    // stableCustomRoleKey 生成的是 12 位 hex，无法还原原文本，但至少给一个可读锚点
    return rest;
  }
  return roleKey;
}

export interface RoleOption {
  key: string;
  label: string;
}

/**
 * 构建岗位筛选项：种子模板 + 当前画像岗位 + 资源中出现的有效岗位，
 * 去重（按 key），未知岗位用可读 label，保留一个“全部岗位”清筛选项。
 */
export function buildRoleOptions(profile: { targetRole?: string | null; targetRoleLabel?: string | null }, resourceRoleKeys: string[]): RoleOption[] {
  const keys = new Set<string>();
  for (const k of seedRoleKeys) keys.add(k);
  if (profile.targetRole) keys.add(profile.targetRole);
  for (const k of resourceRoleKeys) if (k.trim()) keys.add(k);

  const options = Array.from(keys).map((key) => ({ key, label: roleLabelFor(key, profile) }));
  // 确保没有空 label 的选项
  return options.filter((o) => o.label.trim().length > 0);
}
