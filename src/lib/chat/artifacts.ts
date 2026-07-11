import type { ChatMessagePart } from "./persistence";

/**
 * AI 结构化结果到消息部件的白名单转换。
 * 只有通过校验的结构化结果才能写入 ChatMessage.parts，
 * 防止不可信 AI 输出直接污染聊天消息。
 */

/** 创建文本部件 */
export function textPart(text: string): ChatMessagePart {
  return { type: "text", text };
}

/** 创建引用列表部件 */
export function citationsPart(
  items: Array<{
    title: string;
    source: string;
    url?: string;
    accessedAt?: string;
    label: "已核验职业库" | "实时联网调研" | "AI分析与推断";
  }>,
): ChatMessagePart {
  return { type: "citations", items: items.slice(0, 12) };
}

/** 创建画像候选引用部件 */
export function profileCandidateRefPart(candidateId: string): ChatMessagePart {
  return { type: "profile_candidate_ref", candidateId };
}

/** 创建计划引用部件 */
export function planRefPart(planId: string, version: number): ChatMessagePart {
  return { type: "plan_ref", planId, version };
}

/** 创建探索报告引用部件 */
export function explorationReportRefPart(reportId: string): ChatMessagePart {
  return { type: "exploration_report_ref", reportId };
}

/** 创建错误部件 */
export function errorPart(code: string, message: string): ChatMessagePart {
  return { type: "error", code, message };
}
