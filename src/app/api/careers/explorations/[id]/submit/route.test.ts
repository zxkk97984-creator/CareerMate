import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  submitForReview: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/careers/exploration-service", () => ({
  createExplorationService: () => ({ submitForReview: mocks.submitForReview }),
}));

const { POST } = await import("./route");

function buildRequest(): Request {
  return new Request("http://localhost/api/careers/explorations/rpt-1/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/careers/explorations/[id]/submit", () => {
  it("未登录返回 401", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("UNAUTHORIZED"));

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: "rpt-1" }) });
    const json = await res.json();

    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("提交成功返回 draftId", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
    mocks.submitForReview.mockResolvedValue({ draftId: "draft-1" });

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: "rpt-1" }) });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.draftId).toBe("draft-1");
  });

  it("报告不存在返回 404", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
    const err = new Error("报告不存在") as Error & { code: string; status: number };
    err.code = "NOT_FOUND";
    err.status = 404;
    mocks.submitForReview.mockRejectedValue(err);

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: "rpt-1" }) });
    const json = await res.json();

    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("NOT_FOUND");
  });
});
