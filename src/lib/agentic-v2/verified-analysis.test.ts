import { describe, expect, it } from "vitest";
import { buildPlatformContracts } from "./platform-contracts";
import { buildVerifiedAnalysis } from "./verified-analysis";
import type { LoadAgenticV2SnapshotResult } from "@/lib/chat/agentic-v2-snapshot";

function snapshot(): LoadAgenticV2SnapshotResult {
  return {
    profileSnapshot: {
      available: true,
      version: 3,
      data: {
        targetRole: "data_analyst",
        abilityScores: { dataAnalysis: 52, communication: 70 },
      },
    },
    historySnapshot: {
      available: true,
      through: "2026-09-09T08:00:00+08:00",
      data: {
        activePlan: {
          id: "plan-1",
          version: 2,
          status: "active",
          targetRole: "data_analyst",
          createdAt: "2026-09-01T08:00:00+08:00",
          updatedAt: "2026-09-08T08:00:00+08:00",
        },
        recentProgress: [{
          id: "log-1",
          eventType: "task_completed",
          title: "完成 SQL 练习",
          summary: "完成 10 道聚合查询",
          createdAt: "2026-09-08T09:00:00+08:00",
        }],
        recentSimulations: [{
          id: "sim-1",
          scenarioKey: "career_interview",
          scenarioTitle: "岗位面试",
          score: 72,
          turnCount: 4,
          completedAt: "2026-09-07T09:00:00+08:00",
        }],
      },
    },
    simulationState: null,
    jobSampleContext: null,
    currentTime: "2026-09-09T08:00:00+08:00",
    timezone: "Asia/Shanghai",
    contextCoverage: {
      algorithmVersion: "test",
      generatedAt: "2026-09-09T08:00:00+08:00",
      included: [],
      truncated: [],
      missing: [],
    },
  };
}

describe("verified analysis", () => {
  it("runs evidence parsing and growth analysis before the request reaches TBox", () => {
    const base = buildPlatformContracts({
      taskType: "growth_review",
      currentTime: "2026-09-09T08:00:00+08:00",
      timezone: "Asia/Shanghai",
      profileVersion: 3,
      activePlanId: "plan-1",
      basePlanVersion: 2,
      activeLearningRouteKnown: true,
      baseRouteVersion: null,
      weeklyBudgetHours: 6,
      requestedPeriod: null,
      simulationState: null,
      expectedRound: null,
      purpose: "interactive_artifact",
      source: "chat",
      profileSnapshot: snapshot().profileSnapshot,
      historySnapshot: snapshot().historySnapshot,
      careerBaseline: { available: false, roleKey: null, templateVersion: null, evidence: [] },
      marketEvidence: {
        searched: false,
        skipReason: "test",
        collectedAt: null,
        scope: { region: "未指定", experienceLevel: "未指定", timeRange: "未指定" },
        findings: [],
        sources: [],
        conflicts: [],
        confidence: "low",
      },
    });

    const verified = buildVerifiedAnalysis(snapshot(), base.evidenceBundle);
    expect(verified.available).toBe(true);
    const data = verified.data as Record<string, unknown>;
    expect(data.evidence).toMatchObject({ totalItems: expect.any(Number) });
    expect(data.growth).toMatchObject({
      schemaVersion: "1.0",
      trends: { totalProgressEvents: 1 },
    });
  });
});
