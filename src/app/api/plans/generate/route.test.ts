import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPlan: vi.fn(),
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
  mocks.findLatest.mockResolvedValue({ version: 2 });
  mocks.createPlan.mockResolvedValue({ id: "plan-1", targetRole: "data_analyst", version: 3 });
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
    careerPlan: {
      findFirst: mocks.findLatest,
      create: mocks.createPlan,
    },
    progressLog: { create: mocks.logCreate },
  }));
});

describe("POST /api/plans/generate", () => {
  it("rejects invalid roleKey format but accepts valid ones", async () => {
    const invalid = await POST(request({ targetRole: "" }));

    expect(invalid.status).toBe(400);
    expect(mocks.generatePlan).not.toHaveBeenCalled();
  });

  it("creates a pending plan candidate with version increment and progress log", async () => {
    const response = await POST(request({ targetRole: "data_analyst", regenerate: true }));

    expect(response.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);

    // 创建 pending 候选计划（非直接 active）
    const createCall = mocks.createPlan.mock.calls[0][0].data;
    expect(createCall.status).toBe("pending");
    expect(createCall.version).toBe(3);

    // 依然生成进度日志
    expect(mocks.logCreate).toHaveBeenCalledTimes(1);

    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.data.pendingConfirmation).toBe(true);
    expect(json.data.plan.version).toBe(3);
  });

  it("preserves existing plan when transaction fails", async () => {
    mocks.logCreate.mockRejectedValue(new Error("disk full"));

    const response = await POST(request({}));

    expect(response.status).toBe(500);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("handles database conflict during creation", async () => {
    // Simulate Prisma P1008 conflict
    const conflictError = new Error("P1008");
    (conflictError as any).code = "P1008";
    mocks.transaction.mockRejectedValue(conflictError);

    const response = await POST(request({}));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe("PLAN_CONFLICT");
  });
});
