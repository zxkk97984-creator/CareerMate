import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
const mocks = vi.hoisted(() => ({ logs: vi.fn(), plans: vi.fn(), plan: vi.fn(), legacyCount: vi.fn(), v2Count: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => db }));
import { getDashboard, loadGrowthEvidence } from "./service";
const db = { progressLog: { findMany: mocks.logs }, careerPlan: { findMany: mocks.plans, findFirst: mocks.plan }, profileUpdateCandidate: { count: mocks.legacyCount }, agentArtifactCandidate: { count: mocks.v2Count } } as unknown as PrismaClient;
beforeEach(() => { vi.resetAllMocks(); mocks.plans.mockResolvedValue([]); });

describe("dashboard data ownership and evidence", () => {
  it("looks past 50 non-completion events and filters before taking eight results", async () => {
    const log = { id: "older-result", eventType: "task_status_updated", title: "更新状态", summary: "", metadata: '{"status":"done","taskTitle":"SQL 练习"}', relatedPlanId: "old-plan", relatedTaskId: "t", createdAt: new Date("2026-01-01") };
    mocks.logs.mockResolvedValueOnce(Array.from({ length: 50 }, (_, i) => ({ ...log, id: `noise-${i}`, metadata: '{"status":"in_progress"}' }))).mockResolvedValueOnce([log]);
    const results = await loadGrowthEvidence(db, "owner");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("SQL 练习");
    expect(mocks.logs).toHaveBeenCalledTimes(2);
    for (const [args] of mocks.logs.mock.calls) expect(args.where.userId).toBe("owner");
    expect(mocks.plans).toHaveBeenCalledWith({ where: { userId: "owner", id: { in: ["old-plan"] } } });
  });
  it("scopes plans, candidates, and evidence to the logged-in owner", async () => {
    mocks.plan.mockResolvedValue(null); mocks.legacyCount.mockResolvedValue(2); mocks.v2Count.mockResolvedValue(105); mocks.logs.mockResolvedValue([]);
    const result = await getDashboard({ id: "owner", profile: null });
    expect(result.candidateCount).toBe(107);
    for (const mock of [mocks.plan, mocks.legacyCount, mocks.v2Count, mocks.logs]) {
      for (const [args] of mock.mock.calls) expect(args.where.userId).toBe("owner");
    }
  });
});
