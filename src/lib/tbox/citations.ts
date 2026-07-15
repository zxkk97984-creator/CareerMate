/**
 * 百宝箱 citation 事件归一化与 sourceRef 真实性绑定。
 *
 * 核心规则：
 * - 只有百宝箱 SSE citation 事件的 URL 才可信
 * - Agent 在 sourceRef 中自报的 URL 不可信，只做 AI 推断标记
 * - 搜索工具调用 + citation 事件 + 合法外部 URL = 可显示"实时联网调研"
 * - 无搜索证据但有 citation + 知识库来源 = "已核验职业库"
 * - 无任何 citation 证据 = "AI分析与推断"
 */

// ── 类型 ────────────────────────────────────────

export interface NormalizedCitation {
  id: string;
  title: string;
  source: string;
  url?: string;
  accessedAt: string;
  label: "已核验职业库" | "实时联网调研" | "AI分析与推断";
  providerIndex: number;
}

// ── 已知搜索工具名称 ─────────────────────────────

const SEARCH_TOOL_NAMES = new Set([
  "search_engine",
  "web_search",
  "联网搜索",
  "search",
  "websearch",
  "tbox_search",
]);

// ── URL 校验 ────────────────────────────────────

/** 校验是否为合法外部 HTTP(S) URL */
export function isValidExternalUrl(raw: string): boolean {
  if (!raw || raw.trim().length === 0) return false;
  if (raw === "https://" || raw === "http://") return false;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (!url.hostname) return false;
    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0") return false;
    return true;
  } catch {
    return false;
  }
}

// ── 构建 citation 标签 ──────────────────────────

export interface CitationLabelInput {
  hasSearchToolCall: boolean;
  hasCitationEvent: boolean;
  hasValidUrl: boolean;
  hasKnowledgeBaseSource: boolean;
}

/** 根据证据组合确定来源标签 */
export function determineCitationLabel(input: CitationLabelInput): NormalizedCitation["label"] {
  if (input.hasSearchToolCall && input.hasCitationEvent && input.hasValidUrl) {
    return "实时联网调研";
  }
  // 搜索工具+无外部 URL → 来自知识库
  if (input.hasSearchToolCall && input.hasCitationEvent && !input.hasValidUrl) {
    return "已核验职业库";
  }
  // 有 citation 但无搜索工具、无知识库来源 → 无法验证
  return "AI分析与推断";
}

// ── 从原始 citation 事件归一化 ──────────────────

export interface RawCitationEvent {
  title?: string;
  source?: string;
  url?: string;
  index?: number;
  [key: string]: unknown;
}

export function normalizeCitations(
  rawCitations: unknown[],
  hasSearchToolCall: boolean,
): NormalizedCitation[] {
  if (!Array.isArray(rawCitations)) return [];

  return rawCitations
    .map((raw, index) => {
      const c = raw as RawCitationEvent;
      const url = typeof c.url === "string" ? c.url.trim() : undefined;
      const hasValidUrl = url ? isValidExternalUrl(url) : false;

      return {
        id: `citation_${index}`,
        title: typeof c.title === "string" ? c.title.slice(0, 240) : `来源 ${index + 1}`,
        source: typeof c.source === "string" ? c.source.slice(0, 240) : "未知来源",
        url: hasValidUrl ? url : undefined,
        accessedAt: new Date().toISOString(),
        label: determineCitationLabel({
          hasSearchToolCall,
          hasCitationEvent: true,
          hasValidUrl,
          hasKnowledgeBaseSource: hasSearchToolCall && !hasValidUrl,
        }),
        providerIndex: index,
      };
    })
    .filter((c) => c !== null);
}

// ── 判断是否有搜索工具调用 ──────────────────────

export function detectSearchToolCall(toolNames: ReadonlySet<string>): boolean {
  for (const name of toolNames) {
    for (const searchName of SEARCH_TOOL_NAMES) {
      if (name.toLowerCase().includes(searchName.toLowerCase())) return true;
    }
  }
  return false;
}

// ── 根据 searchPolicy 决定 per-turn 搜索开关 ─────

export function resolveSearchPolicy(
  globalSearchEngineEnabled: boolean,
  searchPolicy?: "off" | "allowed" | "required",
): boolean {
  if (!globalSearchEngineEnabled) return false;
  if (searchPolicy === "required") return true;
  // "allowed" 由 Agent 自行决定，默认不强制
  return false;
}
