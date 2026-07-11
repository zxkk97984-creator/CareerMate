import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  getConversation: vi.fn(),
  handleStreamRequest: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("@/lib/chat/service", () => ({
  createChatService: () => ({
    getConversation: mocks.getConversation,
  }),
  ServiceError: class ServiceError extends Error {
    code: string;
    status: number;
    constructor(message: string, code: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

vi.mock("@/lib/chat/stream-service", () => ({
  handleStreamRequest: mocks.handleStreamRequest,
}));

import { POST } from "./route";

const currentUser = {
  id: "user-1",
  username: "student",
  displayName: "学生",
  role: "user" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue(currentUser);
  mocks.getConversation.mockResolvedValue({
    id: "conv-1",
    title: "新对话",
    status: "active",
    lastMessageAt: "2026-07-12T10:00:00.000Z",
    createdAt: "2026-07-12T09:00:00.000Z",
    updatedAt: "2026-07-12T10:00:00.000Z",
  });
  mocks.handleStreamRequest.mockResolvedValue(
    new Response("ok", { headers: { "Content-Type": "text/event-stream" } }),
  );
});

describe("POST /api/chat/conversations/:id/stream", () => {
  it("未登录返回401", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("未登录"));

    const res = await POST(
      new Request("http://localhost/api/chat/conversations/conv-1/stream", {
        method: "POST",
        body: JSON.stringify({ message: "你好" }),
      }),
      { params: Promise.resolve({ id: "conv-1" }) } as any,
    );
    expect(res.status).toBe(401);
  });

  it("会话不存在返回404", async () => {
    mocks.getConversation.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/chat/conversations/conv-1/stream", {
        method: "POST",
        body: JSON.stringify({ message: "你好" }),
      }),
      { params: Promise.resolve({ id: "conv-1" }) } as any,
    );
    expect(res.status).toBe(404);
  });

  it("消息为空返回400", async () => {
    const res = await POST(
      new Request("http://localhost/api/chat/conversations/conv-1/stream", {
        method: "POST",
        body: JSON.stringify({ message: "" }),
      }),
      { params: Promise.resolve({ id: "conv-1" }) } as any,
    );
    expect(res.status).toBe(400);
  });

  it("消息超过8000字符返回400", async () => {
    const res = await POST(
      new Request("http://localhost/api/chat/conversations/conv-1/stream", {
        method: "POST",
        body: JSON.stringify({ message: "a".repeat(8001) }),
      }),
      { params: Promise.resolve({ id: "conv-1" }) } as any,
    );
    expect(res.status).toBe(400);
  });

  it("成功返回SSE流", async () => {
    const res = await POST(
      new Request("http://localhost/api/chat/conversations/conv-1/stream", {
        method: "POST",
        body: JSON.stringify({ message: "什么是数据分析师？" }),
      }),
      { params: Promise.resolve({ id: "conv-1" }) } as any,
    );
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });

  it("传递用户ID和会话ID到流式服务", async () => {
    await POST(
      new Request("http://localhost/api/chat/conversations/conv-1/stream", {
        method: "POST",
        body: JSON.stringify({ message: "你好" }),
      }),
      { params: Promise.resolve({ id: "conv-1" }) } as any,
    );

    expect(mocks.handleStreamRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        conversationId: "conv-1",
        message: "你好",
      }),
      expect.anything(),
    );
  });
});
