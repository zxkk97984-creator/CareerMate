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
  mocks.findPlan.mockResolvedValue({ id: "plan-1" });
  mocks.findLog.mockResolvedValue({ metadata: JSON.stringify({
    requestedMode: "api", actualMode: "manual", degraded: true, fallbackReason: "network_error", source: "manual-fixture",
  }) });
});

describe("GET /api/plans/current", () => {
  it("returns persisted generation execution metadata for the active plan", async () => {
    const payload = await (await GET()).json();

    expect(payload.data).toEqual({
      plan: { id: "plan-1" },
      executionMeta: {
        requestedMode: "api", actualMode: "manual", degraded: true, fallbackReason: "network_error", source: "manual-fixture",
      },
    });
    expect(mocks.findLog).toHaveBeenCalledWith({
      where: { userId: "user-1", relatedPlanId: "plan-1", eventType: "plan_generated" },
      orderBy: { createdAt: "desc" },
      select: { metadata: true },
    });
  });

  it("safely omits malformed generation metadata", async () => {
    mocks.findLog.mockResolvedValue({ metadata: "{}" });

    const payload = await (await GET()).json();

    expect(payload.data.executionMeta).toBeNull();
  });
});
