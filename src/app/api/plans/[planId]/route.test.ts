import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({ careerPlan: { findFirst: mocks.findFirst } }),
}));

const { GET } = await import("./route");

const plan = {
  id: "plan-1",
  userId: "user-1",
  targetRole: "data_analyst",
  version: 2,
  status: "pending",
  years: "[]",
  quarters: "[]",
  months: "[]",
  currentMonthIndex: 1,
  assumptions: "[]",
  riskNotes: "[]",
  generationMeta: "{}",
  sourceReportId: null,
  createdAt: new Date("2026-07-12T00:00:00Z"),
  updatedAt: new Date("2026-07-12T00:00:00Z"),
};

describe("GET /api/plans/:planId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("只读取当前用户的计划", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
    mocks.findFirst.mockResolvedValue(plan);

    const response = await GET(new Request("http://localhost/api/plans/plan-1"), {
      params: Promise.resolve({ planId: "plan-1" }),
    });
    const body = await response.json();

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "plan-1", userId: "user-1" },
    });
    expect(body.data.plan).toMatchObject({ id: "plan-1", status: "pending" });
  });
});
