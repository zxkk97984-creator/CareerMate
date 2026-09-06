/**
 * 建议中心的统一读模型（plan 3.2 / T08a）。
 *
 * 把来自四种存储源的建议（V1 画像候选、V1 记忆建议、V2 AgentArtifact 候选、pending 计划）
 * 归一化成同一客户端视图：列表项用 SuggestionRef 作为 UI key，详情按 kind 判别（禁止 any）。
 *
 * 约定：
 * - 列表 count 与列表过滤同源：只计可处理的 pending（状态以服务端为准，不由前端猜测）。
 * - 同一业务建议若存在显式 source/parent 关联才去重；不按标题或创建时间猜测。
 * - 写接口保持原协议（PATCH profile/candidates、POST memory/:id/decision、
 *   POST plans/:id/decision、POST agentic-v2/candidates/:id/decision），此处只做读模型（不合并写接口）。
 */

/** 候选/建议来源种类 */
export type SuggestionKind = "profile" | "plan" | "memory" | "artifact";

/** 用于 UI key 与详情判别的引用（plan 3.2） */
export type SuggestionRef =
  | { kind: "profile"; id: string }
  | { kind: "plan"; id: string }
  | { kind: "memory"; id: string }
  | { kind: "artifact"; id: string };

/** 可处理的 pending 状态集合（不同源的 pending 枚举可能不同，此处统一以“可确认”为准） */
export const PROCESSABLE_PENDING = new Set(["pending"]);

/** 列表项（轻量）：ref + 展示字段 */
export interface SuggestionListItem {
  ref: SuggestionRef;
  title: string;
  /** 服务端原始状态（pending/accepted/rejected/…） */
  status: string;
  createdAt: string | null;
  summary: string;
}

/** 详情基元：无论哪种 kind 都必填展示（plan 3.2） */
export interface SuggestionCommonDetail {
  ref: SuggestionRef;
  title: string;
  status: string;
  reason: string;
  /** 证据摘要（可能为空，表示暂无来源证据，不应猜测） */
  evidenceSummary: string | null;
  /** 影响范围摘要 */
  impactSummary: string | null;
  /** 实际来源（api/mock/manual/人工样例等），不把 unknown 标记为 API 成功 */
  source: string | null;
  /** 基于哪个版本生成 */
  baseVersion: string | null;
  createdAt: string | null;
}

/** 详情判别联合：按 kind 提供各自的 old/new 值或对比结构 */
export type SuggestionDetail =
  | (SuggestionCommonDetail & { kind: "profile"; oldValue: unknown; newValue: unknown; field: string })
  | (SuggestionCommonDetail & { kind: "memory"; currentContent: string; suggestionText: string })
  | (SuggestionCommonDetail & { kind: "plan"; currentSummary: string | null; pendingSummary: string | null; diff?: PlanDiff })
  | (SuggestionCommonDetail & { kind: "artifact"; candidateType: string; artifact: unknown });

/** 计划差异摘要：仅当有可行对比时提供，否则明示“首个计划” */
export interface PlanDiff {
  directionChanged: boolean;
  addedTasks: number;
  removedTasks: number;
  hourChange: number | null;
}

// ── 各来源的原始形状（只声明读模型需要的字段，不假设前端可修改） ──────────────

export interface ProfileCandidateSource {
  id: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string;
  status: string;
  createdAt: string | null;
  source?: string | null;
  evidenceExcerpt?: string | null;
  impactSummary?: string | null;
  sourceConversationId?: string | null;
}

export interface MemorySource {
  id: string;
  content: string;
  status: string;
  createdAt: string | null;
  /** 记忆建议的提案文本（edit 分支）；仅 pending 记忆建议才作为建议展示 */
  suggestion?: string | null;
}

export interface PendingPlanSource {
  id: string;
  status: string;
  title?: string | null;
  note?: string | null;
  createdAt: string | null;
  /** 计划差异摘要 */
  diff?: PlanDiff | null;
}

export interface ArtifactSource {
  id: string;
  candidateType: string;
  status: string;
  createdAt: string | null;
  title?: string | null;
  summary?: string | null;
  baseVersion?: string | null;
}

// ── 归一化（列表项） ─────────────────────────────────────────────

export function normalizeProfileCandidate(c: ProfileCandidateSource): SuggestionListItem {
  return {
    ref: { kind: "profile", id: c.id },
    title: c.field,
    status: c.status,
    createdAt: c.createdAt,
    summary: c.reason,
  };
}

export function normalizeMemory(m: MemorySource): SuggestionListItem {
  return {
    ref: { kind: "memory", id: m.id },
    title: "记忆建议",
    status: m.status,
    createdAt: m.createdAt,
    summary: m.suggestion ?? m.content,
  };
}

export function normalizePendingPlan(p: PendingPlanSource): SuggestionListItem {
  return {
    ref: { kind: "plan", id: p.id },
    title: p.title ?? "新职业计划",
    status: p.status,
    createdAt: p.createdAt,
    summary: p.note ?? "新计划已准备好，确认后开始执行",
  };
}

export function normalizeArtifact(a: ArtifactSource): SuggestionListItem {
  return {
    ref: { kind: "artifact", id: a.id },
    title: a.title ?? artifactTypeLabel(a.candidateType),
    status: a.status,
    createdAt: a.createdAt,
    summary: a.summary ?? "",
  };
}

function artifactTypeLabel(type: string): string {
  switch (type) {
    case "profile_patch": return "画像更新";
    case "profile_assessment": return "综合评估";
    case "ability_evidence": return "能力证据";
    case "career_plan": return "职业规划";
    case "learning_route": return "学习路线";
    case "growth_replan": return "成长复盘";
    case "memory_item": return "长期记忆";
    case "career_template_draft": return "岗位草稿";
    default: return type;
  }
}

// ── 计数：与列表过滤同源，只计可处理的 pending ─────────────────────────

/** 是否是可处理/可确认的候选（以服务端状态为准，只认可处理的 pending） */
export function isProcessable(status: string): boolean {
  return PROCESSABLE_PENDING.has(status);
}

export interface RawSuggestionSources {
  profile: ProfileCandidateSource[];
  memory: MemorySource[];
  plan: PendingPlanSource[];
  artifact: ArtifactSource[];
}

/** 把四种来源分别归一化成列表项，并只保留可处理的 pending（列表与计数同源）。 */
export function buildSuggestionList(sources: RawSuggestionSources): {
  items: SuggestionListItem[];
  pendingCount: number;
} {
  const items = [
    ...sources.profile.map(normalizeProfileCandidate),
    ...sources.memory.map(normalizeMemory),
    ...sources.plan.map(normalizePendingPlan),
    ...sources.artifact.map(normalizeArtifact),
  ].filter((item) => isProcessable(item.status));

  // 显式去重：同一 ref 只保留一项（前端可能重复拉取）；业务级重复需明确的 source/parent 关联才去重，
  // 这里不做按标题/时间的猜测去重。
  const seen = new Set<string>();
  const unique: SuggestionListItem[] = [];
  for (const item of items) {
    const key = `${item.ref.kind}:${item.ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return { items: unique, pendingCount: unique.length };
}

// ── 详情加载（按 kind 判别，返回类型化 detail） ─────────────────────────

export interface SuggestionDetailLoader {
  /** 各 kind 的详情拉取；失败时返回 { ok:false, status, message }（用 T03 的 ApiResult 归一化）。 */
  profile?: (id: string) => Promise<SuggestionDetailResult<"profile">>;
  plan?: (id: string) => Promise<SuggestionDetailResult<"plan">>;
  memory?: (id: string) => Promise<SuggestionDetailResult<"memory">>;
  artifact?: (id: string) => Promise<SuggestionDetailResult<"artifact">>;
}

export type SuggestionDetailResult<K extends SuggestionKind> =
  | { ok: true; detail: Extract<SuggestionDetail, { kind: K }> }
  | { ok: false; status: number; message: string };

/** 按 ref 加载详情；某 kind 无 loader 或加载失败都返回带类型的失败结果（供 UI 分类：404/409/401）。 */
export async function loadSuggestionDetail(
  ref: SuggestionRef,
  loader: SuggestionDetailLoader,
): Promise<SuggestionDetailResult<SuggestionKind>> {
  const fn = loader[ref.kind];
  if (!fn) return { ok: false, status: 501, message: "该建议类型暂不支持详情" };
  try {
    return await fn(ref.id) as SuggestionDetailResult<SuggestionKind>;
  } catch (error) {
    return { ok: false, status: -1, message: error instanceof Error ? error.message : "详情加载失败" };
  }
}
