import type { TboxHistoryMessage } from "@/lib/tbox/types";

/**
 * T22：从 stream-service 提取的纯 helper（按职责小步拆分，行为不变）。
 * 这些是无副作用/可独立测试的决策与转换函数，主流程仍通过同一逻辑调用它们。
 */

export type SearchPolicy = "off" | "allowed" | "required";

interface SearchPolicyCtx {
  /** 会话级的搜索策略（allowed | required | off） */
  searchPolicy: string;
  /** 会话 scope（general_minimal / privacy 视为 off） */
  scope: string;
}

/**
 * 确定搜索策略：
 * - 非职业 scope（general_minimal / privacy）→ off；
 * - 显式联网请求 / 时效问题（薪资、趋势、招聘、市场、最新）→ required；
 * - “介绍/了解…岗位/职业”类 → required；
 * - 其余回退到会话 searchPolicy。
 */
export function resolveSearchPolicy(userMessage: string, ctx: SearchPolicyCtx): SearchPolicy {
  if (ctx.scope === "general_minimal" || ctx.scope === "privacy") return "off";
  const msg = userMessage.toLowerCase();
  if (/联网|搜索|查一下|最新|薪资|工资|趋势|招聘|行情|市场/.test(msg)) return "required";
  if (/介绍|了解|什么是|怎么样|前景/.test(msg) && /岗位|职业|工作/.test(msg)) return "required";
  return ctx.searchPolicy as SearchPolicy;
}

/**
 * 构建 provider_history 模式的历史消息（排除本轮消息，仅 completed，最多 12 条，每条截断 800 字）。
 */
export function buildProviderHistory(
  messages: Array<{ id: string; role: string; content: string; status: string }>,
  excludeUserMsgId: string,
): TboxHistoryMessage[] {
  return messages
    .filter((m) => m.status === "completed" && m.content && m.id !== excludeUserMsgId)
    .slice(-12)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 800) }));
}

/**
 * 校验 sourceRefs 与 citations 绑定：仅保留 citationIndex 落在 citations 范围内的条目。
 * `_toolCalls` 保留以兼容既有调用签名（当前逻辑不依赖它）。
 */
export function validateSourceRefs(
  sourceRefs: Array<{ citationIndex?: number; kind?: string }> | undefined,
  _toolCalls: unknown[],
  citations: unknown[],
): Array<{ citationIndex: number; kind: string }> {
  if (!sourceRefs || !Array.isArray(sourceRefs)) return [];
  const valid: Array<{ citationIndex: number; kind: string }> = [];
  for (const ref of sourceRefs) {
    const r = ref as Record<string, unknown>;
    const idx = typeof r.citationIndex === "number" ? r.citationIndex : -1;
    if (idx >= 0 && idx < citations.length) {
      valid.push({ citationIndex: idx, kind: (r.kind as string) ?? "ai_inference" });
    }
  }
  return valid;
}
