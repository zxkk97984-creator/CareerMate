import { TboxError } from "./errors";
import type { NormalizedAssistantResult, RetrievalItem } from "./types";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function responseData(input: unknown) {
  const root = record(input);
  if (!root) throw new TboxError("invalid_response");
  return { root, data: record(root.result) ?? record(root.data) ?? root };
}

export function normalizeNonStreamChatResponse(input: unknown): NormalizedAssistantResult {
  const { root, data } = responseData(input);
  const conversationId =
    nonEmptyString(data.conversationId) ??
    nonEmptyString(data.converstionId) ??
    nonEmptyString(data.conversation_id) ??
    nonEmptyString(root.conversationId) ??
    nonEmptyString(root.converstionId) ??
    nonEmptyString(root.conversation_id) ?? undefined;
  const messages = Array.isArray(data.messages)
    ? data.messages
    : Array.isArray(root.messages)
      ? root.messages
      : [];
  const text = messages
    .map(record)
    .filter((message): message is Record<string, unknown> => Boolean(message))
    .filter((message) => message.type === "answer" && message.content_type === "text")
    .map((message) => nonEmptyString(message.content))
    .filter((content): content is string => Boolean(content))
    .join("\n");

  const warnings: string[] = [];
  // 连续相同 answer 只保留一次
  // （已在 collect 上层处理，这里仅标记）

  if (!text) throw new TboxError("invalid_response");
  return { text, conversationId, citations: [], warnings };
}

export function normalizeRetrievalResponse(input: unknown): RetrievalItem[] {
  const root = record(input);
  if (!root) throw new TboxError("invalid_response");
  const officialResponse = "success" in root || "errorCode" in root;
  if (officialResponse && (root.success !== true || String(root.errorCode) !== "0")) {
    throw new TboxError("provider_error");
  }

  const nestedData = record(root.data);
  const candidates = officialResponse
    ? [root.data]
    : [
        nestedData?.results,
        nestedData?.records,
        nestedData?.items,
        root.results,
        root.records,
        root.items,
      ];
  const values = candidates.find(Array.isArray);
  if (!values) throw new TboxError("invalid_response");

  const items = values.flatMap((value) => {
    const item = record(value);
    if (!item) return [];
    const content =
      nonEmptyString(item.content) ??
      nonEmptyString(item.text) ??
      nonEmptyString(item.snippet) ??
      nonEmptyString(item.title);
    if (!content) return [];
    const rawScore = item.score ?? item.relevance_score ?? item.similarity;
    const score = typeof rawScore === "number" && Number.isFinite(rawScore) ? rawScore : 0;
    return [{
      content,
      source:
        nonEmptyString(item.originFileName) ??
        nonEmptyString(item.source) ??
        "tbox-dataset",
      score,
    }];
  });
  if (values.length && !items.length) throw new TboxError("invalid_response");
  return items;
}
