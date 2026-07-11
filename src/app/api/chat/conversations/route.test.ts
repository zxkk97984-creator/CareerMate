import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  createConversation: vi.fn(),
  listConversations: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

// Mock chat service
vi.mock("@/lib/chat/service", () => ({
  createChatService: () => ({
    listConversations: mocks.listConversations,
    createConversation: mocks.createConversation,
  }),
}));

import { GET, POST } from "./route";

const currentUser = {
  id: "user-1",
  username: "student",
  displayName: "学生",
  role: "user" as const,
};

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

// ── GET /api/chat/conversations ──────────────────────────

describe("GET /api/chat/conversations", () => {
  it("未登录返回401", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("未登录"));

    const res = await GET(new Request("http://localhost/api/chat/conversations"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("返回当前用户的非deleted会话列表", async () => {
    mocks.listConversations.mockResolvedValue({
      items: [convItem({ id: "c1" }), convItem({ id: "c2" })],
      nextCursor: null,
    });

    const res = await GET(new Request("http://localhost/api/chat/conversations"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.items).toHaveLength(2);
    expect(mocks.listConversations).toHaveBeenCalledWith("user-1", undefined, 30);
  });

  it("支持cursor和limit查询参数", async () => {
    mocks.listConversations.mockResolvedValue({ items: [], nextCursor: null });

    const res = await GET(
      new Request("http://localhost/api/chat/conversations?cursor=c1&limit=10"),
    );
    expect(res.status).toBe(200);
    expect(mocks.listConversations).toHaveBeenCalledWith("user-1", "c1", 10);
  });

  it("limit超过100时返回400", async () => {
    mocks.listConversations.mockResolvedValue({ items: [], nextCursor: null });

    const res = await GET(
      new Request("http://localhost/api/chat/conversations?limit=200"),
    );
    expect(res.status).toBe(400);
  });
});

// ── POST /api/chat/conversations ─────────────────────────

describe("POST /api/chat/conversations", () => {
  it("未登录返回401", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("未登录"));

    const res = await POST(new Request("http://localhost/api/chat/conversations", {
      method: "POST",
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(401);
  });

  it("创建新会话成功", async () => {
    mocks.createConversation.mockResolvedValue(convItem());

    const res = await POST(new Request("http://localhost/api/chat/conversations", {
      method: "POST",
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe("conv-1");
  });

  it("支持自定义标题", async () => {
    mocks.createConversation.mockResolvedValue(convItem({ title: "探索职业" }));

    const res = await POST(new Request("http://localhost/api/chat/conversations", {
      method: "POST",
      body: JSON.stringify({ title: "探索职业" }),
    }));
    expect(res.status).toBe(200);
    expect(mocks.createConversation).toHaveBeenCalledWith("user-1", "探索职业");
  });

  it("标题超过60字符返回400", async () => {
    const res = await POST(new Request("http://localhost/api/chat/conversations", {
      method: "POST",
      body: JSON.stringify({ title: "a".repeat(61) }),
    }));
    expect(res.status).toBe(400);
  });
});
