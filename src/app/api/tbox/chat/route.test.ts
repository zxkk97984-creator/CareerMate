import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
  logCreate: vi.fn(),
  prepareChat: vi.fn(),
  requireCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/chat/server", () => ({ prepareCareerChat: mocks.prepareChat }));
vi.mock("@/lib/env", () => ({ getTboxConfig: () => ({ mode: "mock" }) }));
vi.mock("@/lib/tbox/adapter", () => ({ chatWithTbox: mocks.chat }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({ progressLog: { create: mocks.logCreate } }),
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue({ id: "user-1", role: "admin" });
  mocks.prepareChat.mockResolvedValue({
    enhancedQuestion: "enhanced hello",
    contextMeta: {
      intent: null,
      usedProfile: true,
      usedPlan: false,
      usedMemoryCount: 0,
      knowledgeSources: [],
      retrievalMeta: null,
    },
  });
  mocks.chat.mockResolvedValue({
    data: { conversationId: "conversation-1", answer: "hello" },
    meta: {
      requestedMode: "mock",
      actualMode: "mock",
      degraded: false,
      fallbackReason: null,
      source: "local-mock",
    },
  });
});

describe("POST /api/tbox/chat", () => {
  it("uses the authenticated user and preserves the response envelope", async () => {
    const response = await POST(
      new Request("http://localhost/api/tbox/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "hello",
          conversationId: "previous",
          context: { targetRole: "data_analyst" },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: { conversationId: "conversation-1", answer: "hello" },
      meta: {
        requestedMode: "mock",
        actualMode: "mock",
        degraded: false,
        fallbackReason: null,
        source: "local-mock",
      },
    });
    expect(mocks.chat).toHaveBeenCalledWith(
      {
        question: "enhanced hello",
        userId: "user-1",
        conversationId: "previous",
      },
      expect.objectContaining({ config: { mode: "mock" } }),
    );
    expect(mocks.prepareChat).toHaveBeenCalledWith({ userId: "user-1", question: "hello" });
    expect(mocks.logCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ summary: "hello" }),
    });
  });

  it("rejects non-admin users with 403", async () => {
    mocks.requireCurrentUser.mockResolvedValueOnce({ id: "user-2", role: "user" });
    const response = await POST(
      new Request("http://localhost/api/tbox/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "hello" }),
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.chat).not.toHaveBeenCalled();
  });

  it("rejects invalid input before invoking the adapter", async () => {
    const response = await POST(
      new Request("http://localhost/api/tbox/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.chat).not.toHaveBeenCalled();
    expect(mocks.prepareChat).not.toHaveBeenCalled();
  });
});
