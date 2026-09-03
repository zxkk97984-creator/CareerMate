import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/plans/generation-service", async (loadOriginal) => {
  const original = await loadOriginal<typeof import("@/lib/plans/generation-service")>();
  return {
    ...original,
    createPlanGenerationService: () => ({ generate: mocks.generate }),
  };
});

import { PlanGenerationError } from "@/lib/plans/generation-service";
import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue({ id: "user-1", profile: { id: "profile-1" } });
  mocks.generate.mockResolvedValue({
    plan: { id: "plan-1", status: "pending" },
    executionMeta: { requestedMode: "api", actualMode: "api", degraded: false, fallbackReason: null, source: "tbox-api" },
  });
});

describe("POST /api/plans/[planId]/generate", () => {
  it("generates only the current user's plan", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ planId: "plan-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.generate).toHaveBeenCalledWith("plan-1", "user-1");
    expect(payload.data.plan.status).toBe("pending");
  });

  it("maps a typed generation failure to a safe response", async () => {
    mocks.generate.mockRejectedValue(new PlanGenerationError(
      "计划生成暂时失败，可以稍后重试",
      "PLAN_GENERATION_FAILED",
      502,
    ));

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ planId: "plan-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.error).toMatchObject({
      code: "PLAN_GENERATION_FAILED",
      message: "计划生成暂时失败，可以稍后重试",
    });
  });
});
