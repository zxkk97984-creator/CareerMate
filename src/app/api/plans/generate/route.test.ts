import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acquireWriteLock: vi.fn(),
  archive: vi.fn(),
  createPlan: vi.fn(),
  findActive: vi.fn(),
  findLatest: vi.fn(),
  generatePlan: vi.fn(),
  logCreate: vi.fn(),
  requireCurrentUser: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/dto", () => ({
  profileDto: (profile: unknown) => profile,
  planDto: (plan: { id: string; targetRole: string; version: number }) => plan,
}));
vi.mock("@/lib/career", () => ({
  serializePlan: () => ({ years: "[]", quarters: "[]", months: "[]", assumptions: "[]", riskNotes: "[]" }),
}));
vi.mock("@/lib/tbox", () => ({
  generatePlanWithTbox: mocks.generatePlan,
  planGenerationNote: () => "fallback note",
}));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ $transaction: mocks.transaction }) }));

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

function request(body?: unknown) {
  return new Request("http://localhost/api/plans/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue({ id: "user-1", profile });
  mocks.generatePlan.mockResolvedValue({ data: { months: [] }, meta });
  mocks.findActive.mockResolvedValue({ id: "active-1" });
  mocks.findLatest.mockResolvedValue({ version: 2 });
  mocks.archive.mockResolvedValue({ count: 1 });
  mocks.createPlan.mockResolvedValue({ id: "plan-1", targetRole: "data_analyst", version: 3 });
  mocks.transaction.mockImplementation(async (callback) => callback({
    $executeRawUnsafe: mocks.acquireWriteLock,
    careerPlan: {
      findFirst: vi.fn((args) => args.where.status === "active" ? mocks.findActive(args) : mocks.findLatest(args)),
      updateMany: mocks.archive,
      create: mocks.createPlan,
    },
    progressLog: { create: mocks.logCreate },
  }));
});

describe("POST /api/plans/generate", () => {
  it("validates supported roles and rejects a role that does not align with the profile", async () => {
    const unsupported = await POST(request({ targetRole: "scraper" }));
    const mismatch = await POST(request({ targetRole: "ai_product_manager" }));

    expect(unsupported.status).toBe(400);
    expect(mismatch.status).toBe(409);
    expect(mocks.generatePlan).not.toHaveBeenCalled();
  });

  it("archives, versions, creates, and logs atomically after a SQLite write lock", async () => {
    const response = await POST(request({ targetRole: "data_analyst", regenerate: true }));

    expect(response.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.acquireWriteLock).toHaveBeenCalledWith("UPDATE User SET id = id WHERE id = ?", "user-1");
    expect(mocks.archive).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "active" },
      data: { status: "archived" },
    });
    expect(mocks.createPlan.mock.calls[0][0].data.version).toBe(3);
    expect(mocks.logCreate).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual({
      ok: true,
      data: { plan: { id: "plan-1", targetRole: "data_analyst", version: 3 }, note: "fallback note" },
      meta,
    });
  });

  it("returns a stable conflict when the active-plan compare/archive count is inconsistent", async () => {
    mocks.archive.mockResolvedValue({ count: 2 });

    const response = await POST(request({ regenerate: true }));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe("PLAN_CONFLICT");
    expect(mocks.createPlan).not.toHaveBeenCalled();
    expect(mocks.logCreate).not.toHaveBeenCalled();
  });

  it("does not perform non-transactional archive operations when an atomic write fails", async () => {
    mocks.logCreate.mockRejectedValue(new Error("disk full"));

    const response = await POST(request({}));

    expect(response.status).toBe(500);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.archive).toHaveBeenCalledTimes(1);
  });
});
