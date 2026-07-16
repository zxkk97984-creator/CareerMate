import type { CareerChatContextMeta, CareerChatIntent } from "@/lib/chat/types";
import { chatMessagePartSchema, type ChatMessagePart } from "@/lib/chat/persistence";
import type { AiExecutionMeta, TboxMode } from "@/lib/types";

export interface FrontendSseBlock {
  event: string;
  data: Record<string, unknown>;
}

interface FrontendSseHandlers {
  onDelta: (content: string) => void;
  onContext?: (context: CareerChatContextMeta & { userMessageId?: string; assistantMessageId?: string }) => void;
  onArtifact?: (part: ChatMessagePart) => void;
}

export interface FrontendSseResult {
  conversationId: string | null;
  meta: AiExecutionMeta | null;
  warnings: string[];
}

const modes: TboxMode[] = ["api", "manual", "mock"];
const intents: CareerChatIntent[] = [
  "roleCompetency",
  "learningResources",
  "simulationScenes",
  "ethicsRules",
];

function executionMeta(value: unknown): AiExecutionMeta | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (
    !modes.includes(item.requestedMode as TboxMode) ||
    !modes.includes(item.actualMode as TboxMode) ||
    typeof item.degraded !== "boolean" ||
    !(item.fallbackReason === null || typeof item.fallbackReason === "string") ||
    typeof item.source !== "string"
  ) {
    return null;
  }
  return {
    requestedMode: item.requestedMode as TboxMode,
    actualMode: item.actualMode as TboxMode,
    degraded: item.degraded,
    fallbackReason: item.fallbackReason as string | null,
    source: item.source,
  };
}

function careerContext(value: Record<string, unknown>): CareerChatContextMeta | null {
  const intent = value.intent;
  const sources = value.knowledgeSources;
  if (
    !(intent === null || intents.includes(intent as CareerChatIntent)) ||
    typeof value.usedProfile !== "boolean" ||
    typeof value.usedPlan !== "boolean" ||
    typeof value.usedMemoryCount !== "number" ||
    !Array.isArray(sources) ||
    !sources.every((source) => typeof source === "string")
  ) {
    return null;
  }
  const retrievalMeta =
    value.retrievalMeta === null || value.retrievalMeta === undefined
      ? null
      : executionMeta(value.retrievalMeta);
  if (value.retrievalMeta !== null && value.retrievalMeta !== undefined && !retrievalMeta) {
    return null;
  }
  return {
    intent: intent as CareerChatIntent | null,
    usedProfile: value.usedProfile,
    usedPlan: value.usedPlan,
    usedMemoryCount: value.usedMemoryCount,
    knowledgeSources: sources,
    retrievalMeta,
  };
}

export function parseFrontendSseBlock(block: string): FrontendSseBlock | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split(/\r\n|\r|\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim() || "message";
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;
  try {
    const data = JSON.parse(dataLines.join("\n"));
    return typeof data === "object" && data !== null && !Array.isArray(data)
      ? { event, data: data as Record<string, unknown> }
      : null;
  } catch {
    return null;
  }
}

export async function consumeFrontendSseResponse(
  response: Response,
  handlersOrDelta: FrontendSseHandlers | ((content: string) => void),
): Promise<FrontendSseResult> {
  const handlers =
    typeof handlersOrDelta === "function"
      ? { onDelta: handlersOrDelta }
      : handlersOrDelta;
  if (!response.ok) throw new Error("对话请求失败");
  if (!response.headers.get("content-type")?.toLowerCase().includes("text/event-stream")) {
    throw new Error("对话服务返回了无效响应");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("对话服务暂时不可用");
  const decoder = new TextDecoder();
  let buffer = "";
  let readerDone = false;
  let completed = false;
  let conversationId: string | null = null;
  let finalMeta: AiExecutionMeta | null = null;
  let warnings: string[] = [];

  function boundary() {
    const match = /\r\n\r\n|\n\n|\r\r/.exec(buffer);
    return match ? { index: match.index, length: match[0].length } : null;
  }

  function consume(block: string) {
    const parsed = parseFrontendSseBlock(block);
    if (!parsed) throw new Error("流式响应格式无效");
    if (parsed.event === "error") {
      throw new Error(
        typeof parsed.data.message === "string" ? parsed.data.message : "对话服务暂时不可用",
      );
    }
    if (
      parsed.event === "message" &&
      parsed.data.type === "delta" &&
      typeof parsed.data.content === "string"
    ) {
      handlers.onDelta(parsed.data.content);
      finalMeta = executionMeta(parsed.data.meta) ?? finalMeta;
    }
    if (parsed.event === "delta" && typeof parsed.data.text === "string") {
      handlers.onDelta(parsed.data.text);
      finalMeta = executionMeta(parsed.data.meta) ?? finalMeta;
    }
    if (parsed.event === "artifact") {
      const part = chatMessagePartSchema.safeParse(parsed.data.part);
      if (part.success) {
        handlers.onArtifact?.(part.data);
      }
      // schema 不匹配时静默跳过（如 citations 超限），不中断整个流
    }
    if (parsed.event === "context") {
      const context = careerContext(parsed.data);
      if (!context) throw new Error("流式响应格式无效");
      const data = parsed.data as Record<string, unknown> | undefined;
      handlers.onContext?.({
        ...context,
        userMessageId: typeof data?.userMessageId === "string" ? data.userMessageId : undefined,
        assistantMessageId: typeof data?.assistantMessageId === "string" ? data.assistantMessageId : undefined,
      });
    }
    if (parsed.event === "done") {
      const remoteConversationId =
        parsed.data.remoteConversationId ?? parsed.data.conversationId;
      conversationId = typeof remoteConversationId === "string" ? remoteConversationId : null;
      finalMeta = executionMeta(parsed.data.meta) ?? finalMeta;
      if (Array.isArray(parsed.data.warnings)) {
        warnings = parsed.data.warnings.filter((w): w is string => typeof w === "string");
      }
      completed = true;
    }
  }

  try {
    while (!completed) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let delimiter = boundary();
      while (delimiter) {
        consume(buffer.slice(0, delimiter.index));
        buffer = buffer.slice(delimiter.index + delimiter.length);
        if (completed) break;
        delimiter = boundary();
      }
      if (done) {
        readerDone = true;
        break;
      }
    }
    if (!completed && buffer.trim()) consume(buffer);
    if (!completed) throw new Error("流式响应未正常结束");
  } finally {
    if (!readerDone) {
      try {
        void reader.cancel().catch(() => undefined);
      } catch {
        // The browser may already have closed or errored the stream.
      }
    }
    reader.releaseLock();
  }
  return { conversationId, meta: finalMeta, warnings };
}
