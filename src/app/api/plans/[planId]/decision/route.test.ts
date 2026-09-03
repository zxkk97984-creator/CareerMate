import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  chatConversationUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    careerPlan: {
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
      update: mocks.update,
    },
    chatConversation: { updateMany: mocks.chatConversationUpdateMany },
    $transaction: mocks.transaction,
  }),
}));

const { POST } = await import("./route");

function req(body: Record<string, unknown>) {
  return new Request("http://localhost/api/plans/plan-1/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/plans/[planId]/decision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
    mocks.transaction.mockImplementation(async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => cb({
      careerPlan: { updateMany: mocks.updateMany, update: mocks.update },
      chatConversation: { updateMany: mocks.chatConversationUpdateMany },
    }));
  });

  it("accept 成功激活 pending 计划", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 1 });
    mocks.updateMany.mockResolvedValueOnce({ count: 1 });
    mocks.update.mockResolvedValue({ id: "plan-1", status: "active" });
    mocks.chatConversationUpdateMany.mockResolvedValue({ count: 1 });
    mocks.findUnique.mockResolvedValue({ id: "plan-1", status: "active" });

    const res = await POST(req({ action: "accept" }), { params: Promise.resolve({ planId: "plan-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.new.status).toBe("active");
  });

  it("reject 成功拒绝 pending 计划", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });

    const res = await POST(req({ action: "reject" }), { params: Promise.resolve({ planId: "plan-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.rejected).toBe(true);
  });

  it("重复 accept 返回 409", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const res = await POST(req({ action: "accept" }), { params: Promise.resolve({ planId: "plan-1" }) });
    expect(res.status).toBe(409);
  });

  it("重复 reject 返回 409", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const res = await POST(req({ action: "reject" }), { params: Promise.resolve({ planId: "plan-1" }) });
    expect(res.status).toBe(409);
  });

  it("跨用户不能操作他人的计划", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const res = await POST(req({ action: "accept" }), { params: Promise.resolve({ planId: "plan-1" }) });
    expect(res.status).toBe(409);
  });

  it("未登录返回 401", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("unauthorized"));

    const res = await POST(req({ action: "accept" }), { params: Promise.resolve({ planId: "plan-1" }) });
    expect(res.status).toBe(401);
  });

  it("参数不合法返回 400", async () => {
    const res = await POST(req({ action: "invalid" }), { params: Promise.resolve({ planId: "plan-1" }) });
    expect(res.status).toBe(400);
  });

  it("accept/reject 并发仅一个成功", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 1 });
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });

    const [acceptRes, rejectRes] = await Promise.all([
      POST(req({ action: "accept" }), { params: Promise.resolve({ planId: "plan-1" }) }),
      POST(req({ action: "reject" }), { params: Promise.resolve({ planId: "plan-1" }) }),
    ]);

    // accept 先执行成功，reject 后执行 count=0
    expect(acceptRes.status).toBe(200);
    expect(rejectRes.status).toBe(409);
  });
});
