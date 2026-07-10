import { TboxError } from "./errors";
import type { NormalizedChat, RetrievalItem } from "./types";

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
  return { root, data: record(root.data) ?? root };
}

export function normalizeNonStreamChatResponse(input: unknown): NormalizedChat {
  const { root, data } = responseData(input);
  const conversationId =
    nonEmptyString(data.conversationId) ??
    nonEmptyString(data.converstionId) ??
    nonEmptyString(data.conversation_id) ??
    nonEmptyString(root.conversationId) ??
    nonEmptyString(root.converstionId) ??
    nonEmptyString(root.conversation_id);
  const messages = Array.isArray(data.messages)
    ? data.messages
    : Array.isArray(root.messages)
      ? root.messages
      : [];
  const answer = messages
    .map(record)
    .filter((message): message is Record<string, unknown> => Boolean(message))
    .filter((message) => message.type === "answer" && message.content_type === "text")
    .map((message) => nonEmptyString(message.content))
    .filter((content): content is string => Boolean(content))
    .join("\n");

  if (!answer) throw new TboxError("invalid_response");
  return { conversationId, answer };
}

export function normalizeRetrievalResponse(input: unknown): RetrievalItem[] {
  const { root, data } = responseData(input);
  const candidates = [data.results, data.records, data.items, root.results, root.records, root.items];
  const values = candidates.find(Array.isArray) ?? [];

  return values.flatMap((value) => {
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
    return [{ content, source: nonEmptyString(item.source) ?? "tbox-dataset", score }];
  });
}
