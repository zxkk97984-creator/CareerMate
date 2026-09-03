import type { NormalizedAiEvent, NormalizedAssistantResult, ToolCallRecord } from "./types";

export interface AssistantResultAccumulator {
  /** 消费一个归一化事件，返回需要转发给前端的增量文本（空字符串表示无需转发） */
  consume(event: NormalizedAiEvent): string;
  /** 完成累积，返回最终的归一化结果 */
  finalize(): NormalizedAssistantResult;
}

export function createAssistantResultAccumulator(): AssistantResultAccumulator {
  let text = "";
  let conversationId: string | undefined;
  const toolCalls: ToolCallRecord[] = [];
  const citations: unknown[] = [];
  const warnings: string[] = [];
  let lastFinal = "";

  function addWarning(code: string) {
    if (!warnings.includes(code)) warnings.push(code);
  }

  return {
    consume(event) {
      if (event.type === "conversation") {
        conversationId = event.conversationId;
        return "";
      }

      // 工具调用开始——记录 toolType/toolId/tool/toolDescription
      if (event.type === "tool_start") {
        toolCalls.push({
          toolType: event.toolType ?? event.name ?? "unknown",
          toolId: event.toolId ?? "",
          tool: event.tool,
          toolDescription: event.toolDescription,
          toolParameters: event.toolParameters,
        });
        return "";
      }

      // 工具调用结束——按 toolId 匹配，回填 resultSummary
      if (event.type === "tool_end") {
        const targetId = event.toolId;
        if (targetId) {
          const match = toolCalls.find((tc) => tc.toolId === targetId);
          if (match) {
            match.resultSummary = event.resultSummary;
          } else {
            toolCalls.push({
              toolType: event.toolType ?? event.name ?? "unknown",
              toolId: targetId,
              toolDescription: event.toolDescription,
              resultSummary: event.resultSummary,
            });
          }
        }
        // 从 resultSummary 提取 citation 数据
        if (event.resultSummary) {
          citations.push({ type: "tool_result", toolType: event.toolType, summary: event.resultSummary });
        }
        return "";
      }

      // agentic 内部事件——透传 payload 但不产生文本
      if (event.type === "agentic_event") {
        return "";
      }

      if (event.type === "citation") {
        citations.push(event.payload);
        return "";
      }

      if (event.type === "warning") {
        addWarning(event.code);
        return "";
      }

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
      return { text, structured: undefined, citations, conversationId, warnings, toolCalls };
    },
  };
}
