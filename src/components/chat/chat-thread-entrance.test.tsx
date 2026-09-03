import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatThread } from "./chat-thread";

function renderThread() {
  return renderToStaticMarkup(
    <ChatThread
      messages={[
        {
          id: "m1",
          conversationId: "c1",
          role: "user",
          content: "你好",
          parts: [],
          status: "completed",
          executionMeta: {},
          contextMeta: {},
          createdAt: "2026-09-03T00:00:00.000Z",
        },
        {
          id: "m2",
          conversationId: "c1",
          role: "assistant",
          content: "你好!",
          parts: [],
          status: "completed",
          executionMeta: {},
          contextMeta: {},
          createdAt: "2026-09-03T00:00:01.000Z",
        },
      ]}
      activeConversationId="c1"
      onNewChat={vi.fn()}
    />,
  );
}

describe("ChatThread 入场标记", () => {
  it("renders data-msg-id on every message wrapper", () => {
    const html = renderThread();
    expect(html).toContain('data-msg-id="m1"');
    expect(html).toContain('data-msg-id="m2"');
  });

  it("renders messages visible without inline opacity", () => {
    const html = renderThread();
    expect(html).toContain("你好");
    expect(html).not.toContain("opacity:0");
  });
});
