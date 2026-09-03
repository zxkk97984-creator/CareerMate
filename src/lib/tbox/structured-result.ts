import { tboxStructuredResultSchema } from "./capability-schemas";
import { agentResponseSchema, type AgentResponse } from "@/lib/chat/agent-protocol";
import type { NormalizedAssistantResult } from "./types";

/**
 * 从助手结果中提取并校验结构化结果。
 *
 * 优先级：
 * 1. result.structured（已解析的）
 * 2. ```json 代码块
 * 3. 整段 JSON
 * 4. 失败则返回 undefined，保留原 Markdown
 *
 * 若 JSON 存在但联合 Schema 不通过：
 * 保留 text，删除不可信 structured，向 warnings 加入 SCHEMA_MISMATCH。
 */
export function parseStructuredAssistantResult(
  result: NormalizedAssistantResult,
): NormalizedAssistantResult {
  // 已有结构化结果 → 直接校验
  if (result.structured !== undefined && result.structured !== null) {
    const parsed = tboxStructuredResultSchema.safeParse(result.structured);
    if (parsed.success) {
      return { ...result, structured: parsed.data };
    }
    // Schema 不通过 → 删除 structured，加 warning
    return {
      ...result,
      structured: undefined,
      warnings: [...result.warnings, "SCHEMA_MISMATCH"],
    };
  }

  // 旧 capability 路径：从正文提取 JSON（仅限模拟训练等旧接口，主聊天不调用此函数）
  const extracted = extractJsonFromText(result.text);
  if (extracted === undefined) {
    return { ...result, structured: undefined };
  }

  const parsed = tboxStructuredResultSchema.safeParse(extracted);
  if (parsed.success) {
    return { ...result, structured: parsed.data };
  }

  return {
    ...result,
    structured: undefined,
    warnings: [...result.warnings, "SCHEMA_MISMATCH"],
  };
}

function extractJsonFromText(text: string): unknown | undefined {
  if (!text.trim()) return undefined;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* continue */ }
  }
  try { return JSON.parse(text.trim()); } catch { /* continue */ }
  const trimmed = text.trim();
  const brackets: Array<{ open: string; close: string }> = [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
  ];
  for (const { open, close } of brackets) {
    const start = trimmed.indexOf(open);
    const end = trimmed.lastIndexOf(close);
    if (start >= 0 && end > start) {
      try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { /* continue */ }
    }
  }
  return undefined;
}

/**
 * 从终端结果解析正式的 AgentResponse。
 *
 * 与 parseStructuredAssistantResult 不同，此函数仅校验 AgentResponse 协议格式，
 * 不处理旧的能力 Schema（profile_assessment 等）。
 *
 * 规则：
 * - structured 不存在 → 零副作用，只返回 warnings
 * - structured 存在但不符合 agentResponseSchema → SCHEMA_MISMATCH warning，零操作
 * - 正文 JSON 代码块不可信 → 不从文本中提取 AgentResponse
 */
export function parseTerminalAgentResponse(
  result: NormalizedAssistantResult,
): { response?: AgentResponse; warnings: string[] } {
  if (result.structured === undefined || result.structured === null) {
    return { warnings: result.warnings ?? [] };
  }

  const parsed = agentResponseSchema.safeParse(result.structured);
  if (parsed.success) {
    return { response: parsed.data, warnings: result.warnings ?? [] };
  }

  return {
    response: undefined,
    warnings: [...(result.warnings ?? []), "AGENT_RESPONSE_SCHEMA_MISMATCH"],
  };
}
