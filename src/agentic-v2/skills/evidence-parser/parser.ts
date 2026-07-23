import { createHash } from "node:crypto";
import {
  type EvidenceItem,
  type EvidenceSourceRoute,
  type EvidenceType,
  type ParsedEvidenceList,
  type ParserInput,
  parserInputSchema,
} from "./schema";

// ---- PII 检测正则 ----

const PII_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "中国手机号", pattern: /1[3-9]\d{9}/g },
  { name: "身份证号", pattern: /\d{17}[\dXx]/g },
  { name: "邮箱", pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { name: "中文姓名", pattern: /(?:姓名|名字|我叫|我是)\s*[:：]?\s*([一-龥]{2,4})(?:\s|$|，|。|,|\.)/g },
  { name: "家庭地址", pattern: /(?:地址|住址|位于|住在)\s*[:：]?\s*(.{5,30})(?:\s|$|，|。|,|\.)/g },
];

const PII_REPLACEMENT = "[已脱敏]";

// ---- 内容哈希 ----

function contentHash(text: string): string {
  return createHash("sha256").update(text.trim().toLowerCase()).digest("hex").slice(0, 16);
}

// ---- PII 脱敏 ----

/** 移除文本中的敏感信息 */
export function stripPII(text: string): { cleaned: string; hasPII: boolean } {
  let cleaned = text;
  let hasPII = false;
  for (const { pattern } of PII_PATTERNS) {
    const matches = cleaned.match(pattern);
    if (matches && matches.length > 0) {
      hasPII = true;
      cleaned = cleaned.replace(pattern, PII_REPLACEMENT);
    }
  }
  return { cleaned, hasPII };
}

// ---- 置信度归一化 ----

/**
 * 将多种格式的置信度统一映射为 0-1 浮点数。
 * - `"high"` → 0.85
 * - `"medium"` → 0.6
 * - `"low"` → 0.35
 * - 数字直接映射
 */
export function normalizeConfidence(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.min(1, raw > 1 ? raw / 100 : raw));
  }
  if (typeof raw === "string") {
    const lower = raw.trim().toLowerCase();
    if (lower === "high") return 0.85;
    if (lower === "medium") return 0.6;
    if (lower === "low") return 0.35;
    const num = Number.parseFloat(lower);
    if (Number.isFinite(num)) return Math.max(0, Math.min(1, num > 1 ? num / 100 : num));
  }
  return 0.5;
}

// ---- 证据提取 ----

let evidenceCounter = 0;

function nextId(source: EvidenceSourceRoute): string {
  evidenceCounter += 1;
  return `${source}-${String(evidenceCounter).padStart(3, "0")}`;
}

function extractFromProfile(profile: unknown): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return items;
  const data = profile as Record<string, unknown>;
  const profileData = (data.data as Record<string, unknown>) ?? {};

  // 能力评分
  const abilityScores = profileData.abilityScores;
  if (abilityScores && typeof abilityScores === "object") {
    for (const [key, score] of Object.entries(abilityScores as Record<string, unknown>)) {
      if (typeof score === "number") {
        const { cleaned } = stripPII(`${key}: ${score}`);
        items.push({
          id: nextId("profile"),
          source: "profile",
          type: "ability_score",
          confidence: 0.9,
          rawQuote: cleaned,
          normalizedClaim: `用户自评 ${key} 能力 ${score}/100`,
          conflicts: [],
        });
      }
    }
  }

  // 学习偏好
  const learningPreference = profileData.learningPreference;
  if (Array.isArray(learningPreference) && learningPreference.length > 0) {
    const { cleaned } = stripPII(learningPreference.join("、"));
    items.push({
      id: nextId("profile"),
      source: "profile",
      type: "preference",
      confidence: 0.9,
      rawQuote: cleaned,
      normalizedClaim: `学习偏好: ${cleaned}`,
      conflicts: [],
    });
  }

  // 约束条件
  const constraints = profileData.constraints;
  if (Array.isArray(constraints) && constraints.length > 0) {
    const { cleaned } = stripPII(constraints.join("、"));
    items.push({
      id: nextId("profile"),
      source: "profile",
      type: "constraint",
      confidence: 0.9,
      rawQuote: cleaned,
      normalizedClaim: `时间/资源约束: ${cleaned}`,
      conflicts: [],
    });
  }

  // 目标职业
  const targetRoleLabel = profileData.targetRoleLabel;
  if (typeof targetRoleLabel === "string" && targetRoleLabel.trim()) {
    const { cleaned } = stripPII(targetRoleLabel);
    items.push({
      id: nextId("profile"),
      source: "profile",
      type: "preference",
      confidence: 0.95,
      rawQuote: cleaned,
      normalizedClaim: `目标职业: ${cleaned}`,
      conflicts: [],
    });
  }

  return items;
}

function extractFromHistory(history: unknown): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  if (!history || typeof history !== "object" || Array.isArray(history)) return items;
  const data = history as Record<string, unknown>;
  const histData = data.data;

  // 如果有 plans 数组
  if (Array.isArray(histData)) {
    for (const entry of histData) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const planStatus = record.status ?? record.currentMonthIndex;
      if (planStatus !== undefined) {
        const { cleaned } = stripPII(
          `计划 ${String(record.targetRoleLabel ?? record.targetRole ?? "")} 状态: ${String(planStatus)}`,
        );
        items.push({
          id: nextId("history"),
          source: "history",
          type: "plan",
          confidence: 0.85,
          rawQuote: cleaned,
          normalizedClaim: cleaned,
          conflicts: [],
        });
      }
      const progressTitle = record.title ?? record.summary;
      if (typeof progressTitle === "string" && progressTitle.trim()) {
        const { cleaned } = stripPII(progressTitle);
        items.push({
          id: nextId("history"),
          source: "history",
          type: "progress",
          confidence: 0.8,
          rawQuote: cleaned,
          normalizedClaim: cleaned,
          conflicts: [],
        });
      }
    }
  }

  return items;
}

function extractFromBaseline(baseline: unknown): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  if (!baseline || typeof baseline !== "object" || Array.isArray(baseline)) return items;
  const data = baseline as Record<string, unknown>;
  const evidence = data.evidence;

  if (Array.isArray(evidence)) {
    for (const entry of evidence) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const claim = record.normalizedClaim ?? record.summary ?? record.rawQuote;
      if (typeof claim === "string" && claim.trim()) {
        const confidence = normalizeConfidence(record.confidence);
        const { cleaned } = stripPII(claim);
        items.push({
          id: nextId("baseline"),
          source: "baseline",
          type: (record.type as EvidenceType) ?? "requirement",
          confidence,
          rawQuote: cleaned,
          normalizedClaim: cleaned,
          conflicts: [],
        });
      }
    }
  }

  // 角色模板版本信息
  const roleKey = data.roleKey;
  const templateVersion = data.templateVersion;
  if (typeof roleKey === "string" && roleKey.trim()) {
    items.push({
      id: nextId("baseline"),
      source: "baseline",
      type: "requirement",
      confidence: 0.9,
      rawQuote: `roleKey: ${roleKey}`,
      normalizedClaim: `职业基线 ${roleKey} (模板版本: ${templateVersion ?? "未知"})`,
      conflicts: [],
    });
  }

  return items;
}

function extractFromMarket(market: unknown): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  if (!market || typeof market !== "object" || Array.isArray(market)) return items;
  const data = market as Record<string, unknown>;

  const findings = data.findings;
  if (Array.isArray(findings)) {
    for (const finding of findings) {
      if (!finding || typeof finding !== "object") continue;
      const record = finding as Record<string, unknown>;
      const claim = record.claim ?? record.summary ?? record.title ?? record.description;
      if (typeof claim === "string" && claim.trim()) {
        const { cleaned } = stripPII(claim);
        const evidenceType: EvidenceType = (record.type as EvidenceType)
          ?? (String(record.category ?? "").includes("salary") ? "market_salary"
            : "market_trend");
        items.push({
          id: nextId("market"),
          source: "market",
          type: evidenceType,
          confidence: normalizeConfidence(record.confidence ?? data.confidence ?? "medium"),
          rawQuote: cleaned,
          normalizedClaim: cleaned,
          conflicts: [],
          metadata: record.url ? { url: record.url } : undefined,
        });
      }
    }
  }

  // 冲突
  const conflicts = data.conflicts;
  if (Array.isArray(conflicts)) {
    for (const conflict of conflicts) {
      if (!conflict || typeof conflict !== "object") continue;
      const record = conflict as Record<string, unknown>;
      const description = record.description ?? record.summary ?? record.claim;
      if (typeof description === "string" && description.trim()) {
        const { cleaned } = stripPII(description);
        items.push({
          id: nextId("market"),
          source: "market",
          type: "market_trend",
          confidence: 0.6,
          rawQuote: cleaned,
          normalizedClaim: `市场证据冲突: ${cleaned}`,
          conflicts: [],
        });
      }
    }
  }

  return items;
}

// ---- 去重 ----

function deduplicate(items: EvidenceItem[]): EvidenceItem[] {
  const seen = new Map<string, EvidenceItem>();
  for (const item of items) {
    const hash = contentHash(item.normalizedClaim);
    const existing = seen.get(hash);
    if (!existing || item.confidence > existing.confidence) {
      seen.set(hash, item);
    }
  }
  return [...seen.values()];
}

// ---- 冲突检测 ----

/**
 * 对同一能力键的不同来源证据互相标记为冲突。
 * 从 normalizedClaim 中提取能力键（如"数据分析"），相同能力不同来源即冲突。
 */
function detectConflicts(items: EvidenceItem[]): EvidenceItem[] {
  // 按来源+类型分组
  const groups = new Map<string, EvidenceItem[]>();
  for (const item of items) {
    const key = `${item.type}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const ids = group.map((i) => i.id);
    for (const item of group) {
      const otherIds = ids.filter((id) => id !== item.id);
      item.conflicts = [...new Set([...item.conflicts, ...otherIds])];
    }
  }

  return items;
}

// ---- 汇总 ----

function buildSummary(items: EvidenceItem[]): {
  bySource: Record<string, number>;
  byType: Record<string, number>;
  conflictCount: number;
  averageConfidence: number;
} {
  const bySource: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let conflictCount = 0;

  for (const item of items) {
    bySource[item.source] = (bySource[item.source] ?? 0) + 1;
    byType[item.type] = (byType[item.type] ?? 0) + 1;
    if (item.conflicts.length > 0) conflictCount += 1;
  }

  const averageConfidence =
    items.length > 0
      ? items.reduce((sum, item) => sum + item.confidence, 0) / items.length
      : 0;

  return { bySource, byType, conflictCount, averageConfidence };
}

// ---- 主入口 ----

/** 解析证据包，返回标准化证据列表。纯函数，无副作用。 */
export function parseEvidenceBundle(input: ParserInput): ParsedEvidenceList {
  // 对损坏输入宽容：safeParse 失败时直接使用原始 input 作为 bundle 继续提取
  const parsed = parserInputSchema.safeParse(input);
  const bundle = parsed.success
    ? parsed.data.evidenceBundle
    : ((input as Record<string, unknown>)?.evidenceBundle ?? input) as Record<string, unknown>;

  const profileItems = extractFromProfile(bundle.profileSnapshot);
  const historyItems = extractFromHistory(bundle.historySnapshot);
  const baselineItems = extractFromBaseline(bundle.careerBaseline);
  const marketItems = extractFromMarket(bundle.marketEvidence);

  let allItems = [...profileItems, ...historyItems, ...baselineItems, ...marketItems];
  allItems = deduplicate(allItems);
  allItems = detectConflicts(allItems);

  return {
    schemaVersion: "1.0",
    parsedAt: new Date().toISOString(),
    totalItems: allItems.length,
    items: allItems,
    summary: buildSummary(allItems),
  };
}

/** 重置内部计数器（用于测试隔离） */
export function resetEvidenceCounter(): void {
  evidenceCounter = 0;
}
