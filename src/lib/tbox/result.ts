import type { NormalizedAiEvent, NormalizedAssistantResult } from "./types";

export interface AssistantResultAccumulator {
  /** 消费一个归一化事件，返回需要转发给前端的增量文本（空字符串表示无需转发） */
  consume(event: NormalizedAiEvent): string;
  /** 完成累积，返回最终的归一化结果 */
  finalize(): NormalizedAssistantResult;
}

export function createAssistantResultAccumulator(): AssistantResultAccumulator {
  let text = "";
  let structured: unknown;
  let conversationId: string | undefined;
  const citations: unknown[] = [];
  const warnings: string[] = [];
  let lastFinal = "";

  function addWarning(code: string) {
    if (!warnings.includes(code)) warnings.push(code);
  }

  return {
    consume(event) {
      if (event.type === "conversation") conversationId = event.conversationId;
      if (event.type === "structured_result") structured = event.payload;
      if (event.type === "citation") citations.push(event.payload);
      if (event.type === "warning") addWarning(event.code);

      if (event.type === "text_delta") {
        text += event.text;
        return event.text;
      }

      if (event.type !== "text_final" || !event.text.trim()) return "";

      const finalText = event.text.trim();
      // 完全等于累积的 delta 文本 → 忽略
      if (finalText === text) {
        addWarning("DUPLICATE_RESPONSE");
        lastFinal = finalText;
        return "";
      }
      // 完全等于上一个 final → 忽略
      if (finalText === lastFinal) {
        addWarning("DUPLICATE_RESPONSE");
        return "";
      }
      // final 以累积文本开头 → 只返回后缀
      if (finalText.startsWith(text) && text.length > 0) {
        const suffix = finalText.slice(text.length);
        text = finalText;
        lastFinal = finalText;
        return suffix;
      }
      // 累积文本以 final 开头 → final 是子集，忽略
      if (text.startsWith(finalText)) {
        addWarning("DUPLICATE_RESPONSE");
        lastFinal = finalText;
        return "";
      }

      // 语义不同的文本 → 追加
      const separator = text ? "\n\n" : "";
      text += separator + finalText;
      lastFinal = finalText;
      return separator + finalText;
    },

    finalize() {
      return { text, structured, citations, conversationId, warnings };
    },
  };
}
