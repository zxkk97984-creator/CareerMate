import { describe, expect, it } from "vitest";
import { normalizeNonStreamChatResponse } from "./normalization";

describe("non-stream chat normalization", () => {
  it.each([
    ["conversationId", { conversationId: "conversation-1" }],
    ["converstionId", { converstionId: "conversation-1" }],
    ["conversation_id", { conversation_id: "conversation-1" }],
  ])("accepts the official %s field variant", (_field, conversation) => {
    expect(
      normalizeNonStreamChatResponse({
        data: {
          ...conversation,
          messages: [
            { type: "reasoning", content_type: "text", content: "not public" },
            { type: "answer", content_type: "text", content: "第一段" },
            { type: "answer", content_type: "text", content: "第二段" },
          ],
        },
      }),
    ).toEqual({ conversationId: "conversation-1", answer: "第一段\n第二段" });
  });
});
