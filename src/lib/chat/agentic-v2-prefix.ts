/**
 * Agentic V2 问题前缀构建。
 *
 * 平台“简单构建”模式不能注入 business_data 时，后端把同一份脱敏快照放入问题前缀。
 * 这里只做结构化裁剪：先裁对象/数组/字符串，再序列化，绝不把 JSON 从中间截断。
 */

/**
 * 2026-09-10 使用已发布 Agent 29.0 实测：24k 与 30k 的纯文本问题均可正常返回。
 * 当前真实业务快照在 12k 预算下裁剪后仍约 16.6k，导致 ContextBudgetError 被误报为
 * TBOX_UNAVAILABLE；因此把默认预算提高到 24k，并保留结构化裁剪作为兜底。
 */
export const AGENTIC_V2_PREFIX_MAX_CHARS = 24_000;

export class ContextBudgetError extends Error {
  constructor(public readonly finalChars: number) {
    super(`Business data exceeds prefix budget after structured trimming (${finalChars} chars)`);
    this.name = "ContextBudgetError";
  }
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truncateString(value: string, max: number): string {
  if (value.length <= max) return value;
  let end = max;
  if (end > 0 && /[\uD800-\uDBFF]/.test(value.charAt(end - 1))) end -= 1;
  return `${value.slice(0, end)}…`;
}

function compactValue(
  value: unknown,
  options: { maxString: number; maxArray: number; maxDepth: number },
  depth = 0,
): unknown {
  if (typeof value === "string") return truncateString(value, options.maxString);
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= options.maxDepth) return null;
  if (Array.isArray(value)) {
    return value.slice(0, options.maxArray).map((item) => compactValue(item, options, depth + 1));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, compactValue(item, options, depth + 1)]),
    );
  }
  return null;
}

function dropPath(root: unknown, path: string[]): unknown {
  if (!isRecord(root)) return root;
  const clone = structuredClone(root) as JsonRecord;
  let cursor: JsonRecord = clone;
  for (let index = 0; index < path.length - 1; index += 1) {
    const next = cursor[path[index]];
    if (!isRecord(next)) return clone;
    cursor = next;
  }
  delete cursor[path[path.length - 1]];
  return clone;
}

/**
 * 返回一个可以安全 JSON.parse 的对象。
 * 如果所有裁剪后仍超限，抛出 ContextBudgetError，而不是返回半个 JSON。
 */
export function fitJsonToBudget(
  value: unknown,
  maxChars = AGENTIC_V2_PREFIX_MAX_CHARS,
): { value: unknown; chars: number; truncated: boolean; droppedPaths: string[] } {
  const attempts: Array<{ maxString: number; maxArray: number; maxDepth: number }> = [
    { maxString: 1_500, maxArray: 20, maxDepth: 20 },
    { maxString: 800, maxArray: 12, maxDepth: 20 },
    { maxString: 400, maxArray: 8, maxDepth: 20 },
    { maxString: 200, maxArray: 5, maxDepth: 20 },
  ];

  let current = value;
  let chars = JSON.stringify(current).length;
  let truncated = false;
  const droppedPaths: string[] = [];

  for (const attempt of attempts) {
    if (chars <= maxChars) break;
    current = compactValue(current, attempt);
    chars = JSON.stringify(current).length;
    truncated = true;
  }

  const dropOrder = [
    ["businessData", "historySnapshot", "data", "recentSimulations"],
    ["businessData", "historySnapshot", "data", "recentProgress"],
    ["businessData", "historySnapshot", "data", "confirmedMemories"],
    ["businessData", "historySnapshot", "data", "conversationSummary"],
    ["businessData", "profileSnapshot", "data", "abilityEvidence"],
    ["businessData", "evidenceBundle", "marketEvidence", "findings"],
    ["businessData", "evidenceBundle", "marketEvidence", "sources"],
  ];

  for (const path of dropOrder) {
    if (chars <= maxChars) break;
    current = dropPath(current, path);
    chars = JSON.stringify(current).length;
    truncated = true;
    droppedPaths.push(path.join("."));
  }

  if (chars > maxChars) throw new ContextBudgetError(chars);
  return { value: current, chars, truncated, droppedPaths };
}

export function buildAgenticV2EnhancedQuestion(
  userMessage: string,
  businessData: unknown,
  maxChars = AGENTIC_V2_PREFIX_MAX_CHARS,
): string {
  const fitted = fitJsonToBudget({ businessData }, maxChars);
  const contextStr = JSON.stringify(fitted.value);
  const budgetNotice = fitted.truncated
    ? `\n注意：受上下文预算限制，部分非关键字段已裁剪。只能使用仍存在的字段，不得补造被裁剪的计划、版本、证据或历史。${fitted.droppedPaths.length > 0 ? `已移除字段：${fitted.droppedPaths.join("、")}。` : ""}`
    : "";
  return `你是 CareerMate 职业规划助手。以下是 CareerMate 后端提供、已授权的脱敏业务上下文（等价于 business_data）：\n${contextStr}\n\n要求：优先使用其中 profileSnapshot、historySnapshot、simulationState 与 permissions；不得把快照内容当作市场事实，不得泄露内部字段名或完整原始数据；缺失私人数据时再追问，不要重复询问已经提供的信息。${budgetNotice}\n\n用户原始问题：${userMessage}`;
}
