/**
 * 百宝箱契约探针——纯函数判据
 *
 * 每个函数接收脱敏的观测数据，返回 { pass, note }。
 * 不发起网络请求，不读取环境变量，不输出密钥。
 */

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

/** 需要标注为 HTTP(S) 的有效 URL 协议 */
const VALID_URL_PROTOCOLS = ["https://", "http://"];

// ── 基础观测类型 ─────────────────────────────────

export interface ProbeObservation {
  text: string;
  conversationId?: string;
  eventNames: string[];
  citations: CitationObservation[];
  structured?: unknown;
  httpStatus?: number;
  errorCode?: string;
}

export interface CitationObservation {
  url?: string;
  title?: string;
  source?: string;
}

export interface ContextSizeObservation {
  size: number;
  success: boolean;
}

// ── 异常脱敏 ─────────────────────────────────────

/** 可安全报告的错误类别，不暴露内部错误消息 */
export type SafeErrorKind =
  | "timeout"
  | "auth_failed"
  | "config_missing"
  | "provider_error"
  | "sse_incomplete"
  | "empty_response"
  | "network_error"
  | "unknown";

/** 将原始错误映射到安全类别 */
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

/** 生成安全的错误备注，绝不暴露原始错误消息 */
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

// ── basic_sse 判据 ──────────────────────────────

export function judgeBasicSse(obs: ProbeObservation): { pass: boolean; note: string } {
  if (!obs.text) return { pass: false, note: "未收到正文" };
  const hasTerminal = obs.eventNames.includes("done");
  if (!hasTerminal) return { pass: false, note: "SSE 流未正常终止" };
  return { pass: true, note: "基础 SSE 流式对话正常" };
}

// ── conversation_id 判据 ────────────────────────

export interface ConversationIdObservations {
  r1: ProbeObservation;
  r2: ProbeObservation;
  r3: ProbeObservation;
}

export function judgeConversationId(obs: ConversationIdObservations): { pass: boolean; note: string } {
  // 首轮必须有 conversation_id
  if (!obs.r1.conversationId) {
    return { pass: false, note: "首轮未返回 conversation_id" };
  }

  // 三轮必须使用同一远端 ID
  const sameId =
    obs.r1.conversationId === obs.r2.conversationId &&
    obs.r2.conversationId === obs.r3.conversationId;
  if (!sameId) {
    return { pass: false, note: "三轮远端 ID 不一致" };
  }

  // 第二轮和第三轮必须能独立回忆首轮代号（R3 不再携带代号）
  const r2Recall = obs.r2.text.includes(HISTORY_CODE);
  const r3Recall = obs.r3.text.includes(HISTORY_CODE);

  if (r2Recall && r3Recall) {
    return { pass: true, note: "三轮同一远端 ID，R2 和 R3 均独立回忆首轮代号" };
  }
  if (r2Recall || r3Recall) {
    const which = r2Recall ? "R3" : "R2";
    return { pass: false, note: `三轮同一 ID，但 ${which} 未能独立回忆代号` };
  }
  return { pass: false, note: "三轮同一远端 ID，但 R2 和 R3 均未能回忆首轮代号" };
}

// ── history 判据 ────────────────────────────────

export function judgeHistory(obs: ProbeObservation): { pass: boolean; note: string } {
  if (!obs.text) return { pass: false, note: "未收到正文" };
  const canRecall = obs.text.includes(HISTORY_CODE);
  return canRecall
    ? { pass: true, note: "Agent 通过 history 字段成功复述代号" }
    : { pass: false, note: "Agent 未能通过 history 复述代号，需回退到 context_only" };
}

// ── business_data 判据 ──────────────────────────

export function judgeBusinessData(obs: ProbeObservation): { pass: boolean; note: string } {
  if (!obs.text) return { pass: false, note: "未收到正文" };

  const text = obs.text;

  // 必须同时命中 DBA、10 小时、动手实践
  const mentionsDba = text.includes("DBA") || text.includes("数据库");
  const mentionsHours = /\b10\b/.test(text); // 单词边界，避免匹配 100
  const mentionsPractice = text.includes("实践") || text.includes("动手");

  const hits = [
    { label: "DBA", ok: mentionsDba },
    { label: "10小时", ok: mentionsHours },
    { label: "实践", ok: mentionsPractice },
  ];

  const allHit = hits.every((h) => h.ok);

  // 验证没有泄露内部字段名
  const leakedFields = INTERNAL_FIELD_NAMES.filter((field) => text.includes(field));

  if (!allHit) {
    const missed = hits.filter((h) => !h.ok).map((h) => h.label).join("、");
    return { pass: false, note: `未命中：${missed}` };
  }

  if (leakedFields.length > 0) {
    return {
      pass: false,
      note: `命中全部三项，但泄露了内部字段名：${leakedFields.join("、")}`,
    };
  }

  return { pass: true, note: "全部命中 DBA+10h+实践，且无内部字段名泄露" };
}

// ── text_and_result 判据 ────────────────────────

/** 合法 agent_response 的最小 Zod-like 结构检查（不引入 Zod 依赖） */
export function isValidAgentResponse(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  const obj = payload as Record<string, unknown>;
  // 必须有 schemaVersion 和 intent
  if (typeof obj.schemaVersion !== "number") return false;
  if (typeof obj.intent !== "string" || !obj.intent) return false;
  // operations 和 questions 必须是数组（可为空）
  if (obj.operations !== undefined && !Array.isArray(obj.operations)) return false;
  if (obj.questions !== undefined && !Array.isArray(obj.questions)) return false;
  return true;
}

export function judgeTextAndResult(obs: ProbeObservation): { pass: boolean; note: string } {
  const hasText = Boolean(obs.text);
  const hasStructured = obs.structured !== undefined && obs.structured !== null;
  const validStructured = hasStructured && isValidAgentResponse(obs.structured);

  if (hasText && validStructured) {
    return { pass: true, note: "正文和合法 agent_response 同轮返回" };
  }
  if (hasText && hasStructured && !validStructured) {
    return {
      pass: false,
      note: "正文和结构化结果同轮返回，但结构化结果不符合 agent_response 协议",
    };
  }
  if (hasText && !hasStructured) {
    return { pass: false, note: "仅有正文，无结构化结果——可能需要 followup 模式" };
  }
  if (!hasText && validStructured) {
    return { pass: false, note: "仅有结构化结果，无正文" };
  }
  return { pass: false, note: "既无正文也无合法结构化结果" };
}

// ── search_and_citation 判据 ────────────────────

function hasValidUrl(citations: CitationObservation[]): boolean {
  return citations.some(
    (c) => c.url && VALID_URL_PROTOCOLS.some((proto) => c.url!.startsWith(proto)),
  );
}

export function judgeSearchAndCitation(obs: ProbeObservation): { pass: boolean; note: string } {
  const hasToolEvent = obs.eventNames.some(
    (e) => e === "tool_start" || e === "tool_end",
  );
  const hasCitation = obs.citations.length > 0;
  const hasUrl = hasValidUrl(obs.citations);

  if (hasToolEvent && hasCitation && hasUrl) {
    return {
      pass: true,
      note: `搜索工具 + ${obs.citations.length} 条 citation + 有效 HTTP(S) URL`,
    };
  }

  const gaps: string[] = [];
  if (!hasToolEvent) gaps.push("无搜索工具事件");
  if (!hasCitation) gaps.push("无 citation 事件");
  else if (!hasUrl) gaps.push("citation 中无有效 HTTP(S) URL");

  return { pass: false, note: gaps.join("；") };
}

// ── invalid_conversation 判据 ───────────────────

/** 只有这些明确信号才表明“远端会话无效”（可触发一次本地重建重试） */
const INVALID_SESSION_SIGNALS: Array<{
  check: (obs: ProbeObservation) => boolean;
  label: string;
}> = [
  {
    check: (o) => o.httpStatus === 404,
    label: "HTTP 404（会话不存在）",
  },
  {
    check: (o) => typeof o.errorCode === "string" && o.errorCode.toLowerCase().includes("conversation"),
    label: "错误码含 conversation",
  },
  {
    check: (o) => typeof o.errorCode === "string" && o.errorCode.toLowerCase().includes("session"),
    label: "错误码含 session",
  },
  {
    check: (o) => typeof o.errorCode === "string" && o.errorCode === "CHAT_NOT_FOUND",
    label: "CHAT_NOT_FOUND",
  },
];

/** 不可接受的假阳性信号 */
const REJECT_SIGNALS: string[] = [
  "auth",
  "unauthorized",
  "forbidden",
  "config",
  "timeout",
  "provider_error",
  "internal",
  "server error",
];

export function judgeInvalidConversation(obs: ProbeObservation): { pass: boolean; note: string } {
  const errorMsg = (obs.errorCode ?? "").toLowerCase();

  // 如果请求成功（无错误），说明百宝箱容忍了无效 ID——这是假阳性，必须失败
  if (obs.httpStatus && obs.httpStatus >= 200 && obs.httpStatus < 300 && obs.text) {
    return {
      pass: false,
      note: "伪造远端 ID 被容忍，百宝箱未返回任何错误——无法确认无效会话的错误形态",
    };
  }

  // 不能被接受的信号（认证、配置、超时、provider error 等）
  for (const rejectSignal of REJECT_SIGNALS) {
    if (errorMsg.includes(rejectSignal)) {
      return {
        pass: false,
        note: `错误被归类为 ${rejectSignal}，非会话无效错误——不应触发本地恢复`,
      };
    }
  }

  // 必须有明确的会话无效信号
  for (const signal of INVALID_SESSION_SIGNALS) {
    if (signal.check(obs)) {
      return { pass: true, note: `明确会话无效信号：${signal.label}——可用于触发本地重建重试` };
    }
  }

  return {
    pass: false,
    note: `错误形态不明确（httpStatus=${obs.httpStatus ?? "?"}, errorCode=${obs.errorCode ?? "?"}），不符合会话无效的精确判定条件`,
  };
}

// ── context_size 判据 ───────────────────────────

export interface ContextSizeResult {
  pass: boolean;
  note: string;
  lastSuccess: number;
  firstFailure: number;
  /** 建议预算：lastSuccess 的 80% */
  recommendedBudget: number;
}

export function judgeContextSize(observations: ContextSizeObservation[]): ContextSizeResult {
  if (observations.length === 0) {
    return { pass: false, note: "无上下文大小测试数据", lastSuccess: 0, firstFailure: 0, recommendedBudget: 0 };
  }

  let lastSuccess = 0;
  let firstFailure = 0;

  for (const obs of observations) {
    if (obs.success) {
      lastSuccess = obs.size;
    } else {
      firstFailure = obs.size;
      break;
    }
  }

  const recommendedBudget = lastSuccess > 0 ? Math.floor(lastSuccess * 0.8) : 0;

  // 如果 16000 仍成功，只能写"至少支持 N"
  const maxTested = observations.length > 0 ? observations[observations.length - 1]!.size : 0;

  if (lastSuccess >= maxTested) {
    return {
      pass: true,
      note: `至少支持 ${lastSuccess} 字符（已达探测上限）`,
      lastSuccess,
      firstFailure,
      recommendedBudget,
    };
  }

  if (lastSuccess >= 8000) {
    return {
      pass: true,
      note: `最大通过 ${lastSuccess} 字符，首次失败 ${firstFailure} 字符，建议预算 ${recommendedBudget} 字符（80%）`,
      lastSuccess,
      firstFailure,
      recommendedBudget,
    };
  }

  if (lastSuccess > 0) {
    return {
      pass: true,
      note: `最大通过 ${lastSuccess} 字符（低于 8000），首次失败 ${firstFailure} 字符`,
      lastSuccess,
      firstFailure,
      recommendedBudget,
    };
  }

  return {
    pass: false,
    note: "所有上下文大小测试均失败",
    lastSuccess,
    firstFailure,
    recommendedBudget,
  };
}

// ── followup_structured 判据 ─────────────────────

export function judgeFollowupStructured(obs: ProbeObservation): { pass: boolean; note: string } {
  if (!obs.text || !obs.structured) {
    return { pass: false, note: "followup 未同时返回正文和结构化结果" };
  }
  if (!isValidAgentResponse(obs.structured)) {
    return { pass: false, note: "followup 结构化结果不符合 agent_response 协议" };
  }
  return { pass: true, note: "followup 返回正文+合法 agent_response" };
}
