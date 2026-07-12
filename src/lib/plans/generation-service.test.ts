import { describe, expect, it, vi } from "vitest";
import { createPlanGenerationService } from "./generation-service";

function planRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "plan-1",
    userId: "user-1",
    targetRole: "ai_product_manager",
    version: 2,
    status: "generating",
    years: "[]",
    quarters: "[]",
    months: "[]",
    currentMonthIndex: 1,
    assumptions: "[]",
    riskNotes: "[]",
    generationMeta: JSON.stringify({ triggeredBy: "chat", attempts: 0 }),
    sourceReportId: null,
    createdAt: new Date("2026-07-12T10:00:00.000Z"),
    updatedAt: new Date("2026-07-12T10:00:00.000Z"),
    ...overrides,
  };
}

function profileRow() {
  return {
    userId: "user-1",
    educationStage: "本科",
    major: "数字媒体技术",
    targetRole: "ai_product_manager",
    targetRoleLabel: "AI 产品经理",
    weeklyAvailableHours: 6,
    learningPreference: "[]",
    experienceSummary: "",
    interestTags: "[]",
    constraints: "[]",
    abilityScores: "{}",
    memoryEnabled: true,
    updatedAt: new Date("2026-07-12T10:00:00.000Z"),
  };
}

function setup(overrides: { existing?: ReturnType<typeof planRow> | null } = {}) {
  const transaction = {
    careerPlan: {
      findFirst: vi.fn()
        .mockResolvedValueOnce(overrides.existing ?? null)
        .mockResolvedValueOnce(planRow({ version: 1, status: "active" })),
      create: vi.fn().mockResolvedValue(planRow()),
    },
    userProfile: { findUnique: vi.fn().mockResolvedValue(profileRow()) },
  };
  const db = {
    $transaction: vi.fn(async (callback: (client: typeof transaction) => unknown) => callback(transaction)),
    careerPlan: {
      findFirst: vi.fn().mockResolvedValue(planRow()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => planRow(data)),
    },
    userProfile: { findUnique: vi.fn().mockResolvedValue(profileRow()) },
  };
  const generatePlan = vi.fn().mockResolvedValue({
    data: { years: [], quarters: [], months: [], assumptions: [], riskNotes: [] },
    meta: {
      requestedMode: "api",
      actualMode: "api",
      degraded: false,
      fallbackReason: null,
      source: "tbox-api",
    },
  });
  const service = createPlanGenerationService({
    db: db as never,
    generatePlan: generatePlan as never,
    now: () => new Date("2026-07-12T12:00:00.000Z"),
  });
  return { service, db, transaction, generatePlan };
}

describe("PlanGenerationService", () => {
  it("creates a real generating plan record for a chat request", async () => {
    const { service, transaction } = setup();

    const result = await service.ensureGenerationPlan({
      userId: "user-1",
      conversationId: "conversation-1",
    });

    expect(result.reused).toBe(false);
    expect(result.plan).toMatchObject({ id: "plan-1", status: "generating", version: 2 });
    expect(transaction.careerPlan.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "generating", userId: "user-1" }),
    }));
  });

  it("reuses an unfinished plan instead of starting a duplicate", async () => {
    const existing = planRow({ id: "plan-existing", status: "pending", version: 4 });
    const { service, transaction } = setup({ existing });

    const result = await service.ensureGenerationPlan({ userId: "user-1" });

    expect(result.reused).toBe(true);
    expect(result.plan.id).toBe("plan-existing");
    expect(transaction.careerPlan.create).not.toHaveBeenCalled();
  });

  it("atomically claims and fills the same plan before marking it pending", async () => {
    const { service, db, generatePlan } = setup();

    const result = await service.generate("plan-1", "user-1");

    expect(db.careerPlan.updateMany).toHaveBeenCalledTimes(1);
    expect(generatePlan).toHaveBeenCalledTimes(1);
    expect(db.careerPlan.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "plan-1" },
      data: expect.objectContaining({ status: "pending" }),
    }));
    expect(result.plan.status).toBe("pending");
  });

  it("records a retryable failed state when generation fails", async () => {
    const { service, db, generatePlan } = setup();
    generatePlan.mockRejectedValue(new Error("upstream secret detail"));

    await expect(service.generate("plan-1", "user-1")).rejects.toMatchObject({
      code: "PLAN_GENERATION_FAILED",
      status: 502,
    });
    expect(db.careerPlan.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "plan-1" },
      data: expect.objectContaining({ status: "generation_failed" }),
    }));
    expect(JSON.stringify(db.careerPlan.update.mock.calls)).not.toContain("upstream secret detail");
  });

  it("allows stale processing work to be reclaimed", async () => {
    const { service, db } = setup();
    db.careerPlan.findFirst.mockResolvedValue(planRow({
      status: "processing",
      updatedAt: new Date("2026-07-12T11:00:00.000Z"),
    }));

    await service.generate("plan-1", "user-1");

    expect(db.careerPlan.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({ status: "processing" }),
        ]),
      }),
    }));
  });
});
