import { describe, expect, it } from "vitest";
import { normalizeNonStreamChatResponse } from "./normalization";

describe("non-stream chat normalization", () => {
  it("accepts the live API result envelope", () => {
    expect(
      normalizeNonStreamChatResponse({
        success: true,
        result: {
          conversation_id: "conversation-live",
          messages: [
            { type: "answer", content_type: "text", content: "真实百宝箱回答" },
            { type: "follow_up", content_type: "text", content: "下一步想了解什么？" },
          ],
        },
      }),
    ).toEqual({ text: "真实百宝箱回答", conversationId: "conversation-live", citations: [], warnings: [] });
  });

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
    ).toEqual({ text: "第一段\n第二段", conversationId: "conversation-1", citations: [], warnings: [] });
  });
});
