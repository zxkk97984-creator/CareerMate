import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceError } from "@/lib/chat/service";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  getMessages: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("@/lib/chat/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chat/service")>();
  return {
    ...actual,
    createChatService: () => ({
      getMessages: mocks.getMessages,
    }),
  };
});

import { GET } from "./route";

const currentUser = {
  id: "user-1",
  username: "student",
  displayName: "学生",
  role: "user" as const,
};

function msgItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    role: "user",
    content: "你好",
    parts: [],
    status: "completed",
    executionMeta: {},
    contextMeta: {},
    createdAt: "2026-07-12T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue(currentUser);
});

// ── GET /api/chat/conversations/:id/messages ─────────────

describe("GET /api/chat/conversations/:id/messages", () => {
  it("未登录返回401", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("未登录"));

    const res = await GET(
      new Request("http://localhost/api/chat/conversations/conv-1/messages"),
      { params: Promise.resolve({ id: "conv-1" }) } as any,
    );
    expect(res.status).toBe(401);
  });

  it("返回会话消息（按创建时间升序）", async () => {
    mocks.getMessages.mockResolvedValue([msgItem({ id: "m1" }), msgItem({ id: "m2" })]);

    const res = await GET(
      new Request("http://localhost/api/chat/conversations/conv-1/messages"),
      { params: Promise.resolve({ id: "conv-1" }) } as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(mocks.getMessages).toHaveBeenCalledWith("conv-1", "user-1", undefined, 50);
  });

  it("支持before和limit查询参数", async () => {
    mocks.getMessages.mockResolvedValue([]);

    const res = await GET(
      new Request("http://localhost/api/chat/conversations/conv-1/messages?before=m50&limit=20"),
      { params: Promise.resolve({ id: "conv-1" }) } as any,
    );
    expect(res.status).toBe(200);
    expect(mocks.getMessages).toHaveBeenCalledWith("conv-1", "user-1", "m50", 20);
  });

  it("跨用户隔离：他人会话返回404", async () => {
    mocks.getMessages.mockRejectedValue(
      new ServiceError("会话不存在", "NOT_FOUND", 404),
    );

    const res = await GET(
      new Request("http://localhost/api/chat/conversations/conv-other/messages"),
      { params: Promise.resolve({ id: "conv-other" }) } as any,
    );
    expect(res.status).toBe(404);
  });

  it("非法parts被安全解析（服务层保证）", async () => {
    mocks.getMessages.mockResolvedValue([
      msgItem({ id: "m1", parts: [] }),
      msgItem({ id: "m2", parts: [{ type: "text", text: "有效" }] }),
    ]);

    const res = await GET(
      new Request("http://localhost/api/chat/conversations/conv-1/messages"),
      { params: Promise.resolve({ id: "conv-1" }) } as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].parts).toEqual([]);
    expect(body.data[1].parts).toEqual([{ type: "text", text: "有效" }]);
  });
});
