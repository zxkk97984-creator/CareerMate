import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logCreate: vi.fn(),
  prepareChat: vi.fn(),
  requireCurrentUser: vi.fn(),
  streamChat: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/chat/server", () => ({ prepareCareerChat: mocks.prepareChat }));
vi.mock("@/lib/env", () => ({ getTboxConfig: () => ({ mode: "api" }) }));
vi.mock("@/lib/tbox/streaming", () => ({ streamChatWithTbox: mocks.streamChat }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({ progressLog: { create: mocks.logCreate } }),
}));

import { GET, POST } from "./route";

const meta = {
  requestedMode: "api",
  actualMode: "manual",
  degraded: true,
  fallbackReason: "http_error",
  source: "manual-fixture",
};

const contextMeta = {
  intent: "roleCompetency",
  usedProfile: true,
  usedPlan: true,
  usedMemoryCount: 1,
  knowledgeSources: ["role-ai-product-manager"],
  retrievalMeta: {
    requestedMode: "api",
    actualMode: "api",
    degraded: false,
    fallbackReason: null,
    source: "tbox-api",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue({ id: "user-1", role: "admin" });
  mocks.prepareChat.mockResolvedValue({
    enhancedQuestion: "enhanced hello",
    contextMeta,
  });
  mocks.streamChat.mockResolvedValue({
    data: {
      events: [
        { event: "message", data: { type: "delta", content: "hello" } },
        { event: "done", data: { conversationId: "conversation-1" } },
      ],
    },
    meta,
  });
});

describe("/api/tbox/chat/stream", () => {
  it("emits canonical frontend SSE events with final execution metadata", async () => {
    const response = await POST(
      new Request("http://localhost/api/tbox/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "hello" }),
      }),
    );
    const text = await response.text();

    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(text).toContain(
      `event: context\ndata: ${JSON.stringify(contextMeta)}\n\n`,
    );
    expect(text).toContain(
      `event: message\ndata: ${JSON.stringify({ type: "delta", content: "hello", meta })}\n\n`,
    );
    expect(text).toContain(
      `event: done\ndata: ${JSON.stringify({ conversationId: "conversation-1", meta })}\n\n`,
    );
    expect(text.indexOf("event: context")).toBeLessThan(text.indexOf("event: message"));
    expect(text.indexOf("event: message")).toBeLessThan(text.indexOf("event: done"));
    expect(mocks.streamChat).toHaveBeenCalledWith(
      { question: "enhanced hello", userId: "user-1" },
      expect.any(Object),
    );
    expect(mocks.prepareChat).toHaveBeenCalledWith({ userId: "user-1", question: "hello" });
    const loggedMeta = JSON.parse(mocks.logCreate.mock.calls[0][0].data.metadata);
    expect(loggedMeta).toEqual(meta);
  });

  it("retains GET query compatibility", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/tbox/chat/stream?question=hello&conversationId=previous",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.streamChat).toHaveBeenCalledWith(
      { question: "enhanced hello", userId: "user-1", conversationId: "previous" },
      expect.any(Object),
    );
  });
});
