import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({ agentArtifactCandidate: { findMany: mocks.findMany, count: mocks.count } }),
}));

const { GET } = await import("./route");

beforeEach(() => {
  mocks.findMany.mockReset();
  mocks.count.mockReset();
  mocks.count.mockResolvedValue(0);
});

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

  it("T21b: 返回真实 total，客户端计数不得用当前页长度冒充", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
    mocks.count.mockResolvedValue(3);
    // 仅返回 1 条（分页器截断），但 total=3
    mocks.findMany.mockResolvedValue([{ id: "c-1", candidateType: "profile_patch", status: "pending", baseVersion: 1, sourceSessionId: "s1", sourceConversationId: null, createdAt: new Date(), resolvedAt: null }]);

    const body = await (await GET(new Request(buildUrl()))).json();

    expect(body.data.items).toHaveLength(1);
    expect(body.data.total).toBe(3);
    // total 来自 count({ where: { userId: user-1 } })，与当前页长度无关
    expect(mocks.count).toHaveBeenCalledWith({ where: expect.objectContaining({ userId: "user-1" }) });
  });

  it("T21b: limit 有上限，超标返回 400", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
    const response = await GET(new Request(buildUrl({ limit: "1000" })));

    expect(response.status).toBe(400);
    expect((await response.json()).ok).toBe(false);
  });

  it("T21b: 大于 limit 时返回 nextCursor（last item createdAt），便于稳定游标翻页", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
    const newer = { id: "c-1", candidateType: "career_plan", status: "pending", baseVersion: 1, sourceSessionId: "s1", sourceConversationId: null, createdAt: new Date("2026-06-01T00:00:00.000Z"), resolvedAt: null };
    const older = { id: "c-2", candidateType: "profile_patch", status: "pending", baseVersion: 1, sourceSessionId: "s1", sourceConversationId: null, createdAt: new Date("2026-01-01T00:00:00.000Z"), resolvedAt: null };
    // limit=1 时多取一条(2) → hasMore=true → nextCursor 非空
    mocks.findMany.mockResolvedValue([newer, older]);

    const body = await (await GET(new Request(buildUrl({ limit: "1" })))).json();

    expect(body.data.items).toHaveLength(1);
    expect(body.data.nextCursor).toBe("2026-06-01T00:00:00.000Z");
  });

  it("T21b: 不足一页时 nextCursor 为 null", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
    mocks.findMany.mockResolvedValue([]);
    const body = await (await GET(new Request(buildUrl({ limit: "50" })))).json();
    expect(body.data.nextCursor).toBeNull();
  });
});
