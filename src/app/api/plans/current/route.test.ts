import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findLog: vi.fn(), findPlan: vi.fn(), requireCurrentUser: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/dto", () => ({ planDto: (plan: { id: string }) => ({ id: plan.id }) }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    careerPlan: { findFirst: mocks.findPlan },
    progressLog: { findFirst: mocks.findLog },
  }),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
  mocks.findPlan
    .mockResolvedValueOnce({ id: "plan-1" })
    .mockResolvedValueOnce({ id: "plan-pending" });
  mocks.findLog.mockResolvedValue({ metadata: JSON.stringify({
    requestedMode: "api", actualMode: "manual", degraded: true, fallbackReason: "network_error", source: "manual-fixture",
  }) });
});

describe("GET /api/plans/current", () => {
  it("returns persisted generation execution metadata for the active plan", async () => {
    const payload = await (await GET()).json();

    expect(payload.data).toEqual({
      plan: { id: "plan-1" },
      pendingPlan: { id: "plan-pending" },
      executionMeta: {
        requestedMode: "api", actualMode: "manual", degraded: true, fallbackReason: "network_error", source: "manual-fixture",
      },
    });
    expect(mocks.findPlan).toHaveBeenNthCalledWith(2, {
      where: { userId: "user-1", status: "pending" },
      orderBy: { createdAt: "desc" },
    });
    expect(mocks.findLog).toHaveBeenCalledWith({
      where: { userId: "user-1", relatedPlanId: "plan-1", eventType: "plan_generated" },
      orderBy: { createdAt: "desc" },
      select: { metadata: true },
    });
  });

  it("safely omits malformed generation metadata", async () => {
    mocks.findPlan
      .mockReset()
      .mockResolvedValueOnce({ id: "plan-1" })
      .mockResolvedValueOnce(null);
    mocks.findLog.mockResolvedValue({ metadata: "{}" });

    const payload = await (await GET()).json();

    expect(payload.data.executionMeta).toBeNull();
    expect(payload.data.pendingPlan).toBeNull();
  });
});
