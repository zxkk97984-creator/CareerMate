import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceError } from "@/lib/chat/service";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  getConversation: vi.fn(),
  updateConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("@/lib/chat/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chat/service")>();
  return {
    ...actual,
    createChatService: () => ({
      getConversation: mocks.getConversation,
      updateConversation: mocks.updateConversation,
      deleteConversation: mocks.deleteConversation,
    }),
  };
});

import { GET, PATCH, DELETE } from "./route";

const currentUser = {
  id: "user-1",
  username: "student",
  displayName: "学生",
  role: "user" as const,
};

function convDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: "conv-1",
    title: "新对话",
    status: "active",
    lastMessageAt: "2026-07-12T10:00:00.000Z",
    createdAt: "2026-07-12T09:00:00.000Z",
    updatedAt: "2026-07-12T10:00:00.000Z",
    ...overrides,
  };
}

function convItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "conv-1",
    title: "新对话",
    status: "active",
    lastMessageAt: "2026-07-12T10:00:00.000Z",
    createdAt: "2026-07-12T09:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue(currentUser);
});

// ── GET /api/chat/conversations/:id ──────────────────────

describe("GET /api/chat/conversations/:id", () => {
  it("未登录返回401", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("未登录"));

    const res = await GET(new Request("http://localhost/api/chat/conversations/conv-1"), {
      params: Promise.resolve({ id: "conv-1" }),
    } as any);
    expect(res.status).toBe(401);
  });

  it("返回属于当前用户的会话详情", async () => {
    mocks.getConversation.mockResolvedValue(convDetail());

    const res = await GET(new Request("http://localhost/api/chat/conversations/conv-1"), {
      params: Promise.resolve({ id: "conv-1" }),
    } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe("conv-1");
  });

  it("他人会话返回404", async () => {
    mocks.getConversation.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/chat/conversations/conv-other"), {
      params: Promise.resolve({ id: "conv-other" }),
    } as any);
    expect(res.status).toBe(404);
  });

  it("deleted会话不可访问", async () => {
    mocks.getConversation.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/chat/conversations/conv-deleted"), {
      params: Promise.resolve({ id: "conv-deleted" }),
    } as any);
    expect(res.status).toBe(404);
  });
});

// ── PATCH /api/chat/conversations/:id ────────────────────

describe("PATCH /api/chat/conversations/:id", () => {
  it("未登录返回401", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("未登录"));

    const res = await PATCH(
      new Request("http://localhost/api/chat/conversations/conv-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "新标题" }),
      }),
      { params: Promise.resolve({ id: "conv-1" }) } as any,
    );
    expect(res.status).toBe(401);
  });

  it("重命名成功", async () => {
    mocks.updateConversation.mockResolvedValue(convItem({ title: "转行用户研究" }));

    const res = await PATCH(
      new Request("http://localhost/api/chat/conversations/conv-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "转行用户研究" }),
      }),
      { params: Promise.resolve({ id: "conv-1" }) } as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.title).toBe("转行用户研究");
  });

  it("标题为空返回400", async () => {
    mocks.updateConversation.mockRejectedValue(
      new ServiceError("标题长度需在1到60个字符之间", "BAD_REQUEST", 400),
    );

    const res = await PATCH(
      new Request("http://localhost/api/chat/conversations/conv-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "" }),
      }),
      { params: Promise.resolve({ id: "conv-1" }) } as any,
    );
    expect(res.status).toBe(400);
  });

  it("标题超过60字符返回400", async () => {
    mocks.updateConversation.mockRejectedValue(
      new ServiceError("标题长度需在1到60个字符之间", "BAD_REQUEST", 400),
    );

    const res = await PATCH(
      new Request("http://localhost/api/chat/conversations/conv-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "a".repeat(61) }),
      }),
      { params: Promise.resolve({ id: "conv-1" }) } as any,
    );
    expect(res.status).toBe(400);
  });

  it("他人会话返回404", async () => {
    mocks.updateConversation.mockRejectedValue(
      new ServiceError("会话不存在", "NOT_FOUND", 404),
    );

    const res = await PATCH(
      new Request("http://localhost/api/chat/conversations/conv-other", {
        method: "PATCH",
        body: JSON.stringify({ title: "标题" }),
      }),
      { params: Promise.resolve({ id: "conv-other" }) } as any,
    );
    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/chat/conversations/:id ────────────────────

describe("DELETE /api/chat/conversations/:id", () => {
  it("未登录返回401", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("未登录"));

    const res = await DELETE(new Request("http://localhost/api/chat/conversations/conv-1"), {
      params: Promise.resolve({ id: "conv-1" }),
    } as any);
    expect(res.status).toBe(401);
  });

  it("软删除成功", async () => {
    mocks.deleteConversation.mockResolvedValue(convItem({ status: "deleted" }));

    const res = await DELETE(new Request("http://localhost/api/chat/conversations/conv-1"), {
      params: Promise.resolve({ id: "conv-1" }),
    } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("deleted");
  });

  it("他人会话返回404", async () => {
    mocks.deleteConversation.mockRejectedValue(
      new ServiceError("会话不存在", "NOT_FOUND", 404),
    );

    const res = await DELETE(new Request("http://localhost/api/chat/conversations/conv-other"), {
      params: Promise.resolve({ id: "conv-other" }),
    } as any);
    expect(res.status).toBe(404);
  });
});
