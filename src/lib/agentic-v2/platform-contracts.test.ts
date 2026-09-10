import { describe, expect, it } from "vitest";
import {
  buildPlatformContractExample,
  buildPlatformContracts,
  platformEvidenceBundleV1Schema,
  platformTaskContextV1Schema,
} from "./platform-contracts";

describe("platform workflow contracts", () => {
  it("builds strict task_context_json and evidence_bundle_json", () => {
    const example = buildPlatformContractExample();
    const taskContext = platformTaskContextV1Schema.parse(JSON.parse(example.task_context_json));
    const evidenceBundle = platformEvidenceBundleV1Schema.parse(JSON.parse(example.evidence_bundle_json));

    expect(taskContext.taskType).toBe("learning_route");
    expect(taskContext.activeLearningRouteKnown).toBe(true);
    expect(taskContext.baseRouteVersion).toBeNull();
    expect(evidenceBundle.marketEvidence.searched).toBe(false);
    expect(evidenceBundle.marketEvidence.skipReason).toBeTruthy();
  });

  it("does not invent a career baseline when it is unavailable", () => {
    const contracts = buildPlatformContracts({
      taskType: "career_exploration",
      currentTime: "2026-09-09T08:00:00+08:00",
      timezone: "Asia/Shanghai",
      profileVersion: 1,
      activePlanId: null,
      basePlanVersion: null,
      activeLearningRouteKnown: false,
      baseRouteVersion: null,
      weeklyBudgetHours: null,
      requestedPeriod: null,
      simulationState: null,
      expectedRound: null,
      purpose: "read_only_report",
      source: "chat",
      profileSnapshot: { available: false, version: null, data: null },
      historySnapshot: { available: false, through: null, data: null },
      careerBaseline: { available: false, roleKey: null, templateVersion: null, evidence: [] },
      marketEvidence: {
        searched: false,
        skipReason: "用户只要求比较已有方向",
        collectedAt: null,
        scope: { region: "全国", experienceLevel: "entry", timeRange: "未知" },
        findings: [],
        sources: [],
        conflicts: [],
        confidence: "low",
      },
    });

    expect(contracts.evidenceBundle.careerBaseline).toEqual({
      available: false,
      roleKey: null,
      templateVersion: null,
      evidence: [],
    });
  });

  it("rejects a claimed baseline without roleKey or templateVersion", () => {
    const result = platformEvidenceBundleV1Schema.safeParse({
      schemaVersion: "1.0",
      request: {},
      profileSnapshot: { available: false, version: null, data: null },
      historySnapshot: { available: false, through: null, data: null },
      careerBaseline: { available: true, roleKey: null, templateVersion: null, evidence: [] },
      marketEvidence: {
        searched: false,
        skipReason: "no search",
        collectedAt: null,
        scope: { region: "全国", experienceLevel: "entry", timeRange: "未知" },
        findings: [],
        sources: [],
        conflicts: [],
        confidence: "low",
      },
    });
    expect(result.success).toBe(false);
  });
});
