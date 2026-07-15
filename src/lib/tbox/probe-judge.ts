/**
 * 百宝箱契约探针——纯函数判据 v2
 *
 * 使用 Task 3 正式 Zod AgentResponse Schema 进行严格校验。
 * 所有判据函数接收脱敏观测数据，返回 { pass, note }。
 * 不发起网络请求，不读取环境变量，不输出密钥。
 */

import { agentResponseSchema } from "@/lib/chat/agent-protocol";

// ── 共享常量 ────────────────────────────────────

export const HISTORY_CODE = "CM-HISTORY-731";

/** 内部字段名——若出现在 Agent 回答中说明 business_data 传递方式有问题 */
const INTERNAL_FIELD_NAMES = [
  "business_data",
  "targetRole",
  "targetRoleLabel",
  "weeklyAvailableHours",
  "learningPreference",
  "_probe_note",
];

// ── 基础观测类型 ─────────────────────────────────

export interface ProbeObservation {
  text: string;
  conversationId?: string;
  eventNames: string[];
  /** 工具类型列表（来自 agentic_tool_start/agentic_tool_end 事件的 toolType 字段） */
  toolNames: string[];
  citations: CitationObservation[];
  structured?: unknown;
  httpStatus?: number;
  errorCode?: string;
  errorCategory?: string;
}

export interface CitationObservation {
  url?: string;
  title?: string;
  source?: string;
}

export interface ContextSizeObservation {
  size: number;
  success: boolean;
  /** 是否为 inconclusive（5xx/认证失败等非长度错误） */
  inconclusive: boolean;
  sentinel: string;
  sentinelRecalled: boolean;
}

// ── 异常脱敏 ─────────────────────────────────────

export type SafeErrorKind =
  | "timeout"
  | "auth_failed"
  | "config_missing"
  | "provider_error"
  | "sse_incomplete"
  | "empty_response"
  | "network_error"
  | "unknown";

export function classifyError(err: unknown): SafeErrorKind {
  const msg = String(err instanceof Error ? err.message : err).toLowerCase();
  if (msg.includes("timeout") || msg.includes("abort")) return "timeout";
  if (msg.includes("401") || msg.includes("403") || msg.includes("auth")) return "auth_failed";
  if (msg.includes("config") || msg.includes("missing")) return "config_missing";
  if (msg.includes("provider") || msg.includes("500") || msg.includes("502") || msg.includes("503"))
    return "provider_error";
  if (msg.includes("sse") || msg.includes("未正常终止")) return "sse_incomplete";
  if (msg.includes("empty") || msg.includes("无响应")) return "empty_response";
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("econnrefused")) return "network_error";
  return "unknown";
}

export function safeErrorNote(err: unknown): string {
  const kind = classifyError(err);
  const map: Record<SafeErrorKind, string> = {
    timeout: "请求超时或连接中断",
    auth_failed: "API 认证失败（401/403）",
    config_missing: "API 配置缺失",
    provider_error: "百宝箱服务端错误（5xx）",
    sse_incomplete: "SSE 流未正常终止",
    empty_response: "百宝箱返回空响应",
    network_error: "网络连接失败",
    unknown: "探针执行异常（已脱敏）",
  };
  return map[kind];
}

// ── URL 校验 ─────────────────────────────────────

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export function isValidExternalUrl(urlStr: unknown): boolean {
  if (typeof urlStr !== "string" || !urlStr.trim()) return false;
  // 禁止仅 "https://" 这种裸协议
  if (urlStr.trim() === "https://" || urlStr.trim() === "http://") return false;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (!parsed.hostname) return false;
    if (BLOCKED_HOSTS.has(parsed.hostname.toLowerCase())) return false;
    return true;
  } catch {
    return false;
  }
}

// ── AgentResponse 严格校验 ───────────────────────

export function parseAgentResponseStrict(payload: unknown): {
  valid: boolean;
  note: string;
} {
  if (payload === undefined || payload === null) {
    return { valid: false, note: "无结构化数据" };
  }
  const result = agentResponseSchema.safeParse(payload);
  if (result.success) return { valid: true, note: "合法 AgentResponse" };
  const issues = result.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`);
  return { valid: false, note: `Schema 不匹配：${issues.join("; ")}` };
}

// ── basic_sse 判据 ──────────────────────────────

export function judgeBasicSse(obs: ProbeObservation): { pass: boolean; note: string } {
  if (!obs.text) return { pass: false, note: "未收到正文" };
  if (!obs.eventNames.includes("done")) return { pass: false, note: "SSE 流未正常终止" };
  return { pass: true, note: "基础 SSE 流式对话正常" };
}

// ── conversation_id 判据 ────────────────────────

export interface ConversationIdObservations {
  r1: ProbeObservation;
  r2: ProbeObservation;
  r3: ProbeObservation;
}

export function judgeConversationId(obs: ConversationIdObservations): { pass: boolean; note: string } {
  if (!obs.r1.conversationId) {
    return { pass: false, note: "首轮未返回 conversation_id" };
  }
  const sameId =
    obs.r1.conversationId === obs.r2.conversationId &&
    obs.r2.conversationId === obs.r3.conversationId;
  if (!sameId) {
    return { pass: false, note: "三轮远端 ID 不一致" };
  }
  // R2 和 R3 必须独立回忆（R3 问题不带代号）
  const r2Recall = obs.r2.text.includes(HISTORY_CODE);
  const r3Recall = obs.r3.text.includes(HISTORY_CODE);
  if (r2Recall && r3Recall) {
    return { pass: true, note: "三轮同一远端 ID，R2 和 R3 均独立回忆首轮代号" };
  }
  if (r2Recall || r3Recall) {
    return { pass: false, note: `三轮同一 ID，但 ${r2Recall ? "R3" : "R2"} 未能独立回忆代号` };
  }
  return { pass: false, note: "三轮同一远端 ID，但 R2 和 R3 均未能回忆首轮代号" };
}

// ── history 判据 ────────────────────────────────

export function judgeHistory(obs: ProbeObservation, historyCode: string): { pass: boolean; note: string } {
  if (!obs.text) return { pass: false, note: "未收到正文" };
  return obs.text.includes(historyCode)
    ? { pass: true, note: "Agent 通过 history 字段成功复述代号" }
    : { pass: false, note: "Agent 未能通过 history 复述代号，需保持 context_only" };
}

// ── business_data 判据（三 sentinel 精确复述）────

export interface BusinessDataSentinels {
  sentinel1: string;
  sentinel2: string;
  sentinel3: string;
}

export function judgeBusinessData(
  obs: ProbeObservation,
  sentinels: BusinessDataSentinels,
): { pass: boolean; note: string } {
  if (!obs.text) return { pass: false, note: "未收到正文" };

  const text = obs.text;
  const hits = [
    { label: "sentinel1", ok: text.includes(sentinels.sentinel1) },
    { label: "sentinel2", ok: text.includes(sentinels.sentinel2) },
    { label: "sentinel3", ok: text.includes(sentinels.sentinel3) },
  ];
  const allHit = hits.every((h) => h.ok);

  const leakedFields = INTERNAL_FIELD_NAMES.filter((field) => text.includes(field));

  if (!allHit) {
    const missed = hits.filter((h) => !h.ok).map((h) => h.label).join("、");
    return { pass: false, note: `未命中：${missed}` };
  }
  if (leakedFields.length > 0) {
    return { pass: false, note: `命中全部 sentinel，但泄露了内部字段名：${leakedFields.join("、")}` };
  }
  return { pass: true, note: "三个 sentinel 全部精确复述，且无内部字段名泄露" };
}

// ── text_and_result 判据（使用正式 Schema）───────

export function judgeTextAndResult(obs: ProbeObservation): { pass: boolean; note: string } {
  const hasText = Boolean(obs.text);
  const { valid, note } = parseAgentResponseStrict(obs.structured);

  if (hasText && valid) {
    return { pass: true, note: `正文和合法 AgentResponse 同轮返回（${note}）` };
  }
  if (hasText && obs.structured !== undefined && !valid) {
    return { pass: false, note: `正文和结构化结果同轮返回，但 ${note}` };
  }
  if (hasText && obs.structured === undefined) {
    return { pass: false, note: "仅有正文，无结构化结果——可能需要 followup 模式" };
  }
  if (!hasText && valid) {
    return { pass: false, note: "仅有结构化结果，无正文" };
  }
  return { pass: false, note: "既无正文也无合法结构化结果" };
}

// ── followup_structured 判据 ─────────────────────

export function judgeFollowupStructured(obs: ProbeObservation): { pass: boolean; note: string } {
  const { valid, note } = parseAgentResponseStrict(obs.structured);
  // followup 允许仅有 structured 无正文（operation-only）
  if (valid) {
    return {
      pass: true,
      note: obs.text ? "followup 返回正文+合法 AgentResponse" : "followup 返回合法 AgentResponse（operation-only）",
    };
  }
  return { pass: false, note: `followup 结构化结果不符合 AgentResponse 协议：${note}` };
}

// ── search_and_citation 判据 ────────────────────

/** 已知的百宝箱搜索工具名称 */
const SEARCH_TOOL_NAMES = new Set([
  "search_engine",
  "web_search",
  "search",
  "联网搜索",
  "websearch",
]);

function hasSearchTool(toolNames: string[]): boolean {
  return toolNames.some((name) =>
    SEARCH_TOOL_NAMES.has(name.toLowerCase()),
  );
}

function hasCitationWithValidUrl(citations: CitationObservation[]): boolean {
  return citations.some((c) => c.url && isValidExternalUrl(c.url));
}

export function judgeSearchAndCitation(obs: ProbeObservation): { pass: boolean; note: string } {
  const hasSearch = hasSearchTool(obs.toolNames);
  const hasCitation = obs.citations.length > 0;
  const hasValidUrl = hasCitationWithValidUrl(obs.citations);

  if (hasSearch && hasCitation && hasValidUrl) {
    return {
      pass: true,
      note: `搜索工具 + ${obs.citations.length} 条 citation + 有效 HTTP(S) URL`,
    };
  }

  const gaps: string[] = [];
  if (!hasSearch) gaps.push("无明确搜索工具调用");
  if (!hasCitation) gaps.push("无 citation 事件");
  else if (!hasValidUrl) gaps.push("citation 中无合法外部 HTTP(S) URL");

  return { pass: false, note: gaps.join("；") };
}

// ── invalid_conversation 判据 ───────────────────

/** 已知的会话无效错误码白名单（仅真实探针确认的精确错误码） */
const INVALID_SESSION_CODES = new Set([
  "CHAT_NOT_FOUND",
  "CONVERSATION_NOT_FOUND",
]);

function isInvalidSessionSignal(httpStatus?: number, errorCode?: string): boolean {
  // HTTP 404 且错误码在白名单中
  if (httpStatus === 404 && errorCode && INVALID_SESSION_CODES.has(errorCode)) return true;
  return false;
}

const REJECT_SIGNALS = [
  "auth", "unauthorized", "forbidden",
  "config", "timeout", "provider_error",
  "internal", "server error", "rate_limited",
];

export function judgeInvalidConversation(obs: ProbeObservation): { pass: boolean; note: string } {
  const errorMsg = (obs.errorCode ?? "").toLowerCase();

  // 如果请求成功，说明百宝箱容忍了无效 ID——假阳性，必须失败
  if (obs.httpStatus && obs.httpStatus >= 200 && obs.httpStatus < 300 && obs.text) {
    return { pass: false, note: "伪造远端 ID 被容忍（200 OK），无法确认会话无效错误形态" };
  }

  // 拒绝非会话错误信号
  for (const rejectSignal of REJECT_SIGNALS) {
    if (errorMsg.includes(rejectSignal) || obs.errorCategory === rejectSignal) {
      return { pass: false, note: `错误归类为 ${rejectSignal}，非会话无效错误` };
    }
  }

  // 检查精确会话无效信号
  if (isInvalidSessionSignal(obs.httpStatus, obs.errorCode)) {
    return { pass: true, note: `明确会话无效：HTTP ${obs.httpStatus} + ${obs.errorCode}` };
  }

  return {
    pass: false,
    note: `错误形态不明确（httpStatus=${obs.httpStatus ?? "?"}, errorCode=${obs.errorCode ?? "?"}），不符合精确判定`,
  };
}

// ── context_size 判据 ───────────────────────────

export interface ContextSizeResult {
  pass: boolean;
  note: string;
  lastSuccess: number;
  firstFailure: number;
  recommendedBudget: number;
}

export function judgeContextSize(observations: ContextSizeObservation[]): ContextSizeResult {
  if (observations.length === 0) {
    return { pass: false, note: "无上下文大小测试数据", lastSuccess: 0, firstFailure: 0, recommendedBudget: 0 };
  }

  let lastSuccess = 0;
  let firstFailure = 0;

  for (const obs of observations) {
    if (obs.inconclusive) {
      // 5xx/认证失败→跳过，不计入成功或失败
      continue;
    }
    if (obs.success && obs.sentinelRecalled) {
      lastSuccess = obs.size;
    } else {
      firstFailure = obs.size;
      break;
    }
  }

  // 安全预算固定 12000 字符
  const recommendedBudget = 12000;
  const maxTested = observations.length > 0 ? observations[observations.length - 1]!.size : 0;

  if (lastSuccess >= maxTested) {
    return {
      pass: true,
      note: `至少支持 ${lastSuccess} 字符（已达探测上限，非平台真实上限）`,
      lastSuccess,
      firstFailure,
      recommendedBudget,
    };
  }

  if (lastSuccess > 0) {
    return {
      pass: true,
      note: `最大通过 ${lastSuccess} 字符，首次失败 ${firstFailure} 字符，安全预算 ${recommendedBudget} 字符`,
      lastSuccess,
      firstFailure,
      recommendedBudget,
    };
  }

  return {
    pass: false,
    note: "所有上下文大小测试均失败或 inconclusive",
    lastSuccess,
    firstFailure,
    recommendedBudget,
  };
}

// ── 对抗负例判据 ─────────────────────────────────

export function judgeAdversarialNegatives(results: Array<{ label: string; valid: boolean }>): { pass: boolean; note: string } {
  const failed = results.filter((r) => !r.valid);
  if (failed.length === results.length) {
    return { pass: true, note: `全部 ${results.length} 项对抗负例正确拒绝` };
  }
  const passed = results.filter((r) => r.valid).map((r) => r.label);
  return { pass: false, note: `${passed.length} 项对抗负例未正确拒绝：${passed.join("、")}` };
}
