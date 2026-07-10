import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
  logCreate: vi.fn(),
  requireCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/env", () => ({ getTboxConfig: () => ({ mode: "mock" }) }));
vi.mock("@/lib/tbox/adapter", () => ({ chatWithTbox: mocks.chat }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({ progressLog: { create: mocks.logCreate } }),
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
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
        question: "hello",
        userId: "user-1",
        conversationId: "previous",
        context: { targetRole: "data_analyst" },
      },
      expect.objectContaining({ config: { mode: "mock" } }),
    );
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
  });
});
