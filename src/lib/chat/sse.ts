// ── SSE 编码工具 ──────────────────────────────────────────
// 统一编码 context / delta / artifact / done / error 事件

const encoder = new TextEncoder();

/** 编码一条 SSE 事件 */
export function formatSseEvent(
  event: string,
  data: unknown,
): Uint8Array {
  const json = JSON.stringify(data);
  return encoder.encode(`event: ${event}\ndata: ${json}\n\n`);
}

/** 写入一条 SSE 事件到流控制器 */
export function writeSseEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: string,
  data: unknown,
): void {
  controller.enqueue(formatSseEvent(event, data));
}

/** 编码 context 事件（必须是第一条 SSE 事件） */
export function encodeContextEvent(context: {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  intent: string | null;
  usedProfile: boolean;
  usedPlan: boolean;
  usedMemoryCount: number;
  knowledgeSources: string[];
}): Uint8Array {
  return formatSseEvent("context", context);
}

/** 编码 delta 事件（流式文本增量） */
export function encodeDeltaEvent(messageId: string, text: string): Uint8Array {
  return formatSseEvent("delta", { messageId, text });
}

/** 编码 artifact 事件（结构化部件） */
export function encodeArtifactEvent(messageId: string, part: unknown): Uint8Array {
  return formatSseEvent("artifact", { messageId, part });
}

/** 编码 done 事件（流正常结束） */
export function encodeDoneEvent(data: {
  messageId: string;
  remoteConversationId: string | null;
  status: "completed" | "stopped";
  meta: {
    requestedMode: string;
    actualMode: string;
    degraded: boolean;
    fallbackReason: string | null;
    source: string;
  };
}): Uint8Array {
  return formatSseEvent("done", data);
}

/** 编码 error 事件（流异常终止） */
export function encodeErrorEvent(data: {
  messageId: string | null;
  code: string;
  message: string;
  retryable: boolean;
}): Uint8Array {
  return formatSseEvent("error", data);
}
