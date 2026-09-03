/**
 * 百宝箱 citation 归一化与来源真实性绑定。
 *
 * 核心规则：
 * - 真实 citation 来源于 agentic_tool_end.resultSummary 字段
 * - resultSummary 格式：[参考资料 N] (相关度: 0.XX)\n标题\n内容…
 * - 搜索工具使用（夸克搜索等）→ citation + 外部 URL → "实时联网调研"
 * - 知识库查询 → citation + 无外部 URL → "已核验职业库"
 * - 无任何 citation 证据 → "AI分析与推断"
 */

import type { ToolCallRecord } from "./types";

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

// ── 已知搜索工具名称（精确匹配 toolType 或 tool 字段） ──

/** toolType 为搜索的类型 */
const SEARCH_TOOL_TYPES = new Set([
  "search_engine",
  "web_search",
  "联网搜索",
  "search",
  "websearch",
  "tbox_search",
  // 夸克搜索 MCP 插件（待确认实际 toolType）
  "夸克搜索",
  "quark_search",
  "qsearch",
]);

/** tool 字段值为搜索工具的名称 */
const SEARCH_TOOL_NAMES = new Set([
  // 真实 API 搜索工具
  "web_content_extractor",
  "query_search",
  // 历史兼容
  "search_engine",
  "web_search",
  "夸克搜索",
  "quark_search",
  "qsearch",
  // Real Quark search MCP tool names (toolType is often generic "tool")
  "quark_article_search_content",
  "quark_search_content",
  "quark_web_search",
  "quark_search",
]);

// ── 知识库工具名称 ─────────────────────────────

const KNOWLEDGE_TOOL_NAMES = new Set([
  "knowledge",
  "知识库查询",
  "retrieval",
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

// ── 从 resultSummary 提取 citation ──────────────

interface ParsedResultRef {
  title: string;
  content: string;
  relevance: number;
  refIndex: number;
  url?: string;
}

/**
 * 从 agentic_tool_end.resultSummary 解析引用
 * 格式: [参考资料 N] (相关度: 0.XX)\n标题\n内容…
 */
function parseResultSummary(summary: string): ParsedResultRef[] {
  const refs: ParsedResultRef[] = [];
  // 匹配 [参考资料 N] (相关度: X.XX)
  const refPattern = /\[参考资料\s+(\d+)\]\s*\(相关度:\s*([\d.]+)\)\s*\n/g;
  let match: RegExpExecArray | null;

  // 收集所有匹配位置
  const matches: Array<{ index: number; end: number; refNum: number; relevance: number }> = [];
  while ((match = refPattern.exec(summary)) !== null) {
    matches.push({
      index: match.index,
      end: match.index + match[0].length,
      refNum: parseInt(match[1], 10),
      relevance: parseFloat(match[2]),
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const contentStart = m.end;
    const contentEnd = i + 1 < matches.length ? matches[i + 1].index : summary.length;
    const block = summary.slice(contentStart, contentEnd).trim();

    // 第一行通常是标题（以 ## 或纯文本开头）
    const lines = block.split("\n");
    const titleLine = lines.find((l) => l.trim() && !l.startsWith("|")) ?? `参考资料 ${m.refNum}`;
    const title = titleLine.replace(/^#+\s*/, "").trim().slice(0, 240);

    // 尝试提取 URL
    const urlMatch = block.match(/(https?:\/\/[^\s\n]{5,})/);
    const url = urlMatch ? urlMatch[1] : undefined;

    refs.push({
      title,
      content: block.slice(0, 500),
      relevance: m.relevance,
      refIndex: m.refNum,
      url,
    });
  }

  // 如果没有找到标准格式，尝试简单提取
  if (refs.length === 0 && summary.trim()) {
    const lines = summary.split("\n");
    const titleLine = lines.find((l) => l.trim() && !l.startsWith("|")) ?? "";
    refs.push({
      title: titleLine.replace(/^#+\s*/, "").trim().slice(0, 240) || "知识库参考资料",
      content: summary.slice(0, 500),
      relevance: 0.5,
      refIndex: 1,
    });
  }

  return refs;
}

/** Quark search tool names start with "quark" (toolType is often generic "tool"). */
function isSearchToolName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return SEARCH_TOOL_TYPES.has(normalized) || SEARCH_TOOL_NAMES.has(normalized) || normalized.startsWith("quark");
}

export function isSearchToolCall(toolCalls: ToolCallRecord[]): boolean {
  for (const tc of toolCalls) {
    if (tc.toolType && isSearchToolName(tc.toolType)) return true;
    if (tc.tool && isSearchToolName(tc.tool)) return true;
  }
  return false;
}

/** 判断工具类型是否为知识库 */
function isKnowledgeToolCall(toolCalls: ToolCallRecord[]): boolean {
  for (const tc of toolCalls) {
    if (KNOWLEDGE_TOOL_NAMES.has(tc.toolType)) return true;
  }
  return false;
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
  if (input.hasSearchToolCall && input.hasCitationEvent && !input.hasValidUrl) {
    return "已核验职业库";
  }
  if (input.hasKnowledgeBaseSource && input.hasCitationEvent) {
    return "已核验职业库";
  }
  return "AI分析与推断";
}

// ── 从 resultSummary 构建 citation ──────────────

export function normalizeCitationsFromToolCalls(
  toolCalls: ToolCallRecord[],
): NormalizedCitation[] {
  const results: NormalizedCitation[] = [];
  const hasSearch = isSearchToolCall(toolCalls);
  const hasKnowledge = isKnowledgeToolCall(toolCalls);

  for (const tc of toolCalls) {
    if (!tc.resultSummary) continue;

    const refs = parseResultSummary(tc.resultSummary);
    for (const ref of refs) {
      const hasValidUrl = ref.url ? isValidExternalUrl(ref.url) : false;
      results.push({
        id: `citation_${tc.toolType}_${ref.refIndex}`,
        title: ref.title,
        source: hasKnowledge ? "CareerMate 知识库" : ref.url ? "联网搜索" : "未知来源",
        url: hasValidUrl ? ref.url : undefined,
        accessedAt: new Date().toISOString(),
        label: determineCitationLabel({
          hasSearchToolCall: hasSearch,
          hasCitationEvent: true,
          hasValidUrl,
          hasKnowledgeBaseSource: hasKnowledge,
        }),
        providerIndex: results.length,
      });
    }
  }

  return results;
}

// ── 兼容旧接口：从原始 citation 事件归一化 ──────

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

  const results: NormalizedCitation[] = [];
  for (let index = 0; index < rawCitations.length; index++) {
    const raw = rawCitations[index];
    const c = raw as RawCitationEvent;
    // 如果是 tool_result 类型（来自 result.ts），跳过——由 normalizeCitationsFromToolCalls 处理
    if ((c as any).type === "tool_result") continue;

    const url = typeof c.url === "string" ? c.url.trim() : undefined;
    const hasValidUrl = url ? isValidExternalUrl(url) : false;

    results.push({
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
    });
  }
  return results;
}

// ── 判断是否有搜索工具调用（同时检查 toolType 和 tool 字段）──

export function detectSearchToolCall(toolNames: ReadonlySet<string>): boolean {
  for (const name of toolNames) {
    if (isSearchToolName(name)) return true;
  }
  return false;
}

// ── 根据 searchPolicy 决定 per-turn 搜索开关 ─────

export function resolveSearchPolicy(
  globalSearchEngineEnabled: boolean,
  searchPolicy?: "off" | "allowed" | "required",
): boolean {
  if (!globalSearchEngineEnabled) return false;
  return searchPolicy !== "off";
}
