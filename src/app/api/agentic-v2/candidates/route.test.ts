import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({ agentArtifactCandidate: { findMany: mocks.findMany } }),
}));

const { GET } = await import("./route");

function buildUrl(params: Record<string, string> = {}) {
  const search = new URLSearchParams(params).toString();
  return `http://localhost/api/agentic-v2/candidates${search ? `?${search}` : ""}`;
}

describe("GET /api/agentic-v2/candidates", () => {
  it("未登录返回 401", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("unauthorized"));
    const response = await GET(new Request(buildUrl()));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.ok).toBe(false);
  });

  it("返回 { items } 结构", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
    mocks.findMany.mockResolvedValue([
      { id: "c-1", candidateType: "profile_patch", status: "pending", baseVersion: 1, sourceSessionId: "s1", sourceConversationId: null, createdAt: new Date(), resolvedAt: null },
    ]);

    const response = await GET(new Request(buildUrl()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].id).toBe("c-1");
  });

  it("status 过滤仅返回符合条件的候选", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
    mocks.findMany.mockResolvedValue([]);

    const response = await GET(new Request(buildUrl({ status: "pending" })));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.items).toEqual([]);

    // 验证 findMany 接收到了 status 过滤
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "pending" }) }),
    );
  });

  it("用户隔离：不同用户看到不同候选", async () => {
    mocks.findMany.mockReset();

    // user-1 的候选
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
    mocks.findMany.mockResolvedValue([{ id: "c-1", candidateType: "profile_patch", status: "pending" }]);

    const r1 = await GET(new Request(buildUrl()));
    const b1 = await r1.json();
    expect(b1.data.items).toHaveLength(1);
    expect(b1.data.items[0].id).toBe("c-1");

    // user-2 的候选
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-2" });
    mocks.findMany.mockResolvedValue([{ id: "c-2", candidateType: "career_plan", status: "pending" }]);

    const r2 = await GET(new Request(buildUrl()));
    const b2 = await r2.json();
    expect(b2.data.items).toHaveLength(1);
    expect(b2.data.items[0].id).toBe("c-2");

    // 两次 findMany 的 where 应包含不同 userId
    const calls = mocks.findMany.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].where).toMatchObject({ userId: "user-1" });
    expect(calls[1][0].where).toMatchObject({ userId: "user-2" });
  });

  it("非法 status 参数返回 400", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
    const response = await GET(new Request(buildUrl({ status: "deleted" })));
    expect(response.status).toBe(400);
  });

  it("空列表返回空 items 数组", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
    mocks.findMany.mockResolvedValue([]);
    const response = await GET(new Request(buildUrl()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.items).toEqual([]);
  });
});
