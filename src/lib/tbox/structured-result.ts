import { tboxStructuredResultSchema, type TboxStructuredResult } from "./capability-schemas";
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

  // 从文本中提取 JSON
  const extracted = extractJsonFromText(result.text);
  if (extracted === undefined) {
    return { ...result, structured: undefined };
  }

  const parsed = tboxStructuredResultSchema.safeParse(extracted);
  if (parsed.success) {
    return { ...result, structured: parsed.data };
  }

  // JSON 存在但 Schema 不通过
  return {
    ...result,
    structured: undefined,
    warnings: [...result.warnings, "SCHEMA_MISMATCH"],
  };
}

function extractJsonFromText(text: string): unknown | undefined {
  if (!text.trim()) return undefined;

  // 1. ```json 代码块
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* continue */ }
  }

  // 2. 整段 JSON
  try { return JSON.parse(text.trim()); } catch { /* continue */ }

  // 3. 尝试提取最外层 { } 或 [ ]
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
