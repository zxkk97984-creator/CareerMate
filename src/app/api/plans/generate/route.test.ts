import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  archive: vi.fn(),
  createPlan: vi.fn(),
  findLatest: vi.fn(),
  generatePlan: vi.fn(),
  logCreate: vi.fn(),
  requireCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/dto", () => ({
  profileDto: (profile: unknown) => profile,
  planDto: (plan: { id: string }) => ({ id: plan.id }),
}));
vi.mock("@/lib/career", () => ({
  serializePlan: () => ({ years: "[]", quarters: "[]", months: "[]", assumptions: "[]", riskNotes: "[]" }),
}));
vi.mock("@/lib/tbox", () => ({
  generatePlanWithTbox: mocks.generatePlan,
  planGenerationNote: () => "fallback note",
}));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    careerPlan: {
      updateMany: mocks.archive,
      findFirst: mocks.findLatest,
      create: mocks.createPlan,
    },
    progressLog: { create: mocks.logCreate },
  }),
}));

import { POST } from "./route";

const profile = {
  userId: "user-1",
  targetRole: "data_analyst",
  targetRoleLabel: "数据分析师",
};
const meta = {
  requestedMode: "api",
  actualMode: "manual",
  degraded: true,
  fallbackReason: "missing_config",
  source: "manual-fixture",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue({ id: "user-1", profile });
  mocks.generatePlan.mockResolvedValue({ data: { months: [] }, meta });
  mocks.findLatest.mockResolvedValue({ version: 2 });
  mocks.createPlan.mockResolvedValue({ id: "plan-1" });
});

describe("POST /api/plans/generate", () => {
  it("returns consistent metadata and records requested and actual execution", async () => {
    const response = await POST();

    expect(await response.json()).toEqual({
      ok: true,
      data: { plan: { id: "plan-1" }, note: "fallback note" },
      meta,
    });
    const logged = mocks.logCreate.mock.calls[0][0].data;
    expect(JSON.parse(logged.metadata)).toEqual(meta);
    expect(logged.summary).toBe("fallback note");
  });
});
