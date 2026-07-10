import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOwnedPlan: vi.fn(),
  findUpdatedPlan: vi.fn(),
  logCreate: vi.fn(),
  requireCurrentUser: vi.fn(),
  transaction: vi.fn(),
  updatePlan: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/dto", () => ({
  planDto: (plan: { id: string; months: string; updatedAt: Date }) => ({
    id: plan.id,
    months: JSON.parse(plan.months),
    updatedAt: plan.updatedAt.toISOString(),
  }),
}));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    careerPlan: { findFirst: mocks.findOwnedPlan },
    $transaction: mocks.transaction,
  }),
}));

import { PATCH } from "./route";

function months(status = "not_started") {
  return Array.from({ length: 36 }, (_, index) => ({
    monthIndex: index + 1,
    goal: `Month ${index + 1}`,
    learningTasks: index === 0 ? [{ id: "task-1", title: "Learn", type: "learn", status, dueWeek: 2 }] : [],
    practiceOutputs: [],
    evaluationMetrics: [],
  }));
}

const basePlan = {
  id: "plan-1",
  userId: "user-1",
  status: "active",
  months: JSON.stringify(months()),
  updatedAt: new Date("2026-07-11T00:00:00.000Z"),
};

function call(status: string, planId = "plan-1", taskId = "task-1") {
  return PATCH(
    new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ status }) }),
    { params: Promise.resolve({ planId, taskId }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
  mocks.findOwnedPlan.mockResolvedValue(basePlan);
  mocks.updatePlan.mockResolvedValue({ count: 1 });
  mocks.findUpdatedPlan.mockImplementation(async () => ({
    ...basePlan,
    months: mocks.updatePlan.mock.calls[0][0].data.months,
    updatedAt: new Date("2026-07-11T00:01:00.000Z"),
  }));
  mocks.transaction.mockImplementation(async (callback) => callback({
    careerPlan: { updateMany: mocks.updatePlan, findUnique: mocks.findUpdatedPlan },
    progressLog: { create: mocks.logCreate },
  }));
});

describe("PATCH /api/plans/:planId/tasks/:taskId", () => {
  it("requires auth and hides plans owned by another user", async () => {
    mocks.requireCurrentUser.mockRejectedValueOnce(new Error("unauthorized"));
    const unauthorized = await call("done");
    mocks.findOwnedPlan.mockResolvedValueOnce(null);
    const unknown = await call("done");

    expect(unauthorized.status).toBe(401);
    expect(unknown.status).toBe(404);
    expect(mocks.findOwnedPlan).toHaveBeenCalledWith({ where: { id: "plan-1", userId: "user-1" } });
  });

  it("rejects invalid status and archived plans", async () => {
    const invalid = await call("complete");
    mocks.findOwnedPlan.mockResolvedValueOnce({ ...basePlan, status: "archived" });
    const archived = await call("done");

    expect(invalid.status).toBe(400);
    expect(archived.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown task and does not write", async () => {
    const response = await call("done", "plan-1", "missing");

    expect(response.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("is idempotent for the same status without a duplicate log", async () => {
    const response = await call("not_started");

    expect(response.status).toBe(200);
    expect((await response.json()).data.changed).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logCreate).not.toHaveBeenCalled();
  });

  it("uses updatedAt CAS and persists the winning task update with one log", async () => {
    const response = await call("done");
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.updatePlan).toHaveBeenCalledWith({
      where: { id: "plan-1", userId: "user-1", status: "active", updatedAt: basePlan.updatedAt },
      data: { months: expect.any(String) },
    });
    expect(payload.data.plan.months[0].learningTasks[0].status).toBe("done");
    expect(mocks.logCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: "user-1",
      relatedPlanId: "plan-1",
      relatedTaskId: "task-1",
      eventType: "task_status_updated",
    }) });
  });

  it("returns 409 on CAS loss and creates no progress log", async () => {
    mocks.updatePlan.mockResolvedValue({ count: 0 });

    const response = await call("done");

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("PLAN_CONFLICT");
    expect(mocks.logCreate).not.toHaveBeenCalled();
  });
});
