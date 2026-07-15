import { createHash } from "node:crypto";

// ── 种子别名表 ──────────────────────────────────

/** 已知职业的别名映射（规范化后→稳定 key） */
const SEED_ALIASES: Record<string, { key: string; label: string }> = {
  // DBA
  dba: { key: "database_administrator", label: "数据库管理员（DBA）" },
  "数据库管理员": { key: "database_administrator", label: "数据库管理员（DBA）" },
  "数据库运维": { key: "database_administrator", label: "数据库管理员（DBA）" },
  "数据库运维工程师": { key: "database_administrator", label: "数据库管理员（DBA）" },
  "database administrator": { key: "database_administrator", label: "数据库管理员（DBA）" },
  // AI 产品经理（种子职业，不作为白名单）
  "ai产品经理": { key: "ai_product_manager", label: "AI 产品经理" },
  "ai 产品经理": { key: "ai_product_manager", label: "AI 产品经理" },
  "人工智能产品经理": { key: "ai_product_manager", label: "AI 产品经理" },
  // 数据分析师（种子职业）
  "数据分析师": { key: "data_analyst", label: "数据分析师" },
  "data analyst": { key: "data_analyst", label: "数据分析师" },
  // AIGC 内容运营（种子职业）
  "aigc内容运营": { key: "aigc_operator", label: "AIGC 内容运营" },
  "aigc 内容运营": { key: "aigc_operator", label: "AIGC 内容运营" },
  "aigc运营": { key: "aigc_operator", label: "AIGC 内容运营" },
  "ai内容运营": { key: "aigc_operator", label: "AIGC 内容运营" },
  "ai 内容运营": { key: "aigc_operator", label: "AIGC 内容运营" },
};

// ── 辅助函数 ────────────────────────────────────

function normalizeName(raw: string): string {
  return raw
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/的$/g, "")      // "我想做数据库运维方面的" → 去尾缀"的"
    .replace(/[（(].*$/, "")  // 去掉括号注释
    .replace(/(?:方面|方向|岗位)$/g, "");
}

/** 同时生成无空格版本用于别名查找 */
function normalizeNameCompact(raw: string): string {
  return normalizeName(raw).replace(/\s+/g, "");
}

// ── 公开 API ────────────────────────────────────

export const roleCoverageValues = [
  "verified_template",
  "knowledge_base_supported",
  "live_research",
  "unverified",
] as const;
export type RoleCoverage = (typeof roleCoverageValues)[number];

export interface RoleIdentity {
  key: string;
  label: string;
  normalizedLabel: string;
  coverage: RoleCoverage;
  templateId?: string;
}

/** 已知角色的稳定 key 集合（种子职业） */
export const seedRoleKeys = [
  "database_administrator",
  "ai_product_manager",
  "data_analyst",
  "aigc_operator",
] as const;

/**
 * 尝试从种子别名解析职业身份
 * 返回 undefined 表示不是已知别名
 */
export function resolveSeedRoleAlias(
  raw: string,
): RoleIdentity | undefined {
  const normalized = normalizeName(raw);
  if (!normalized) return undefined;

  // 先精确匹配，再尝试无空格版本
  const compact = normalizeNameCompact(raw);
  const entry = SEED_ALIASES[normalized] ?? SEED_ALIASES[compact];
  if (!entry) return undefined;

  return {
    key: entry.key,
    label: entry.label,
    normalizedLabel: entry.label,
    coverage: "verified_template",
  };
}

/**
 * 为未知职业生成稳定的自定义 key（SHA-256，取前12位 hex）
 */
export function stableCustomRoleKey(raw: string): string {
  const normalized = raw.normalize("NFKC").trim().toLocaleLowerCase();
  const hash = createHash("sha256").update(normalized).digest("hex");
  return `custom_${hash.slice(0, 12)}`;
}

/**
 * 从任意原始输入解析角色身份
 * 已知别名返回 verified_template，否则生成 custom key，标记 unverified
 */
export function resolveRoleIdentity(
  raw: string,
  options?: { templateId?: string; coverage?: RoleCoverage },
): RoleIdentity {
  const seed = resolveSeedRoleAlias(raw);
  if (seed) {
    return {
      ...seed,
      templateId: options?.templateId,
      coverage: options?.coverage ?? seed.coverage,
    };
  }

  const key = stableCustomRoleKey(raw);
  const label = raw.normalize("NFKC").trim();
  return {
    key,
    label,
    normalizedLabel: label,
    coverage: options?.coverage ?? "unverified",
    templateId: options?.templateId,
  };
}

/**
 * 规范化角色名称用于 UI 显示（兼容旧 roleKeyFromName）
 */
export function roleKeyFromName(raw: string): string {
  return resolveRoleIdentity(raw).key;
}
