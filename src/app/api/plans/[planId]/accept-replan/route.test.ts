import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  acceptReplan: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/plans/replan-service", () => ({
  createReplanService: () => ({ acceptReplan: mocks.acceptReplan }),
}));

const { POST } = await import("./route");

function buildRequest(): Request {
  return new Request("http://localhost/api/plans/plan-1/accept-replan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/plans/[planId]/accept-replan", () => {
  it("未登录返回 401", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("UNAUTHORIZED"));

    const res = await POST(buildRequest(), { params: Promise.resolve({ planId: "plan-1" }) });
    const json = await res.json();

    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("确认成功返回新旧计划和差异", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
    mocks.acceptReplan.mockResolvedValue({
      old: { id: "old-1", version: 2, status: "archived" },
      new: { id: "plan-1", version: 3, status: "active" },
      diff: { directionChange: true, directionSummary: "方向变更", addedMilestones: [], removedMilestones: [], addedTasks: [], removedTasks: [] },
    });

    const res = await POST(buildRequest(), { params: Promise.resolve({ planId: "plan-1" }) });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.new.status).toBe("active");
    expect(json.data.new.version).toBe(3);
  });

  it("候选不存在返回 404", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
    const err = new Error("重规划候选不存在") as Error & { code: string; status: number };
    err.code = "NOT_FOUND";
    err.status = 404;
    mocks.acceptReplan.mockRejectedValue(err);

    const res = await POST(buildRequest(), { params: Promise.resolve({ planId: "plan-x" }) });
    const json = await res.json();

    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("跨用户确认返回 404", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-2" });
    const err = new Error("重规划候选不存在") as Error & { code: string; status: number };
    err.code = "NOT_FOUND";
    err.status = 404;
    mocks.acceptReplan.mockRejectedValue(err);

    const res = await POST(buildRequest(), { params: Promise.resolve({ planId: "plan-1" }) });
    const json = await res.json();

    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("NOT_FOUND");
  });
});
