import { describe, expect, it } from "vitest";
import {
  agentArtifactV1Schema,
  evidenceBundleV1Schema,
  researchReportV1Schema,
  reviewReportV1Schema,
} from "./contracts";

const marketEvidence = {
  searched: true,
  skipReason: null,
  collectedAt: "2026-07-21T00:00:00.000Z",
  scope: { region: "CN", experienceLevel: "entry", timeRange: "2026-Q3" },
  findings: [],
  sources: [],
  conflicts: [],
  confidence: "medium",
};

describe("Agentic V2 platform contracts", () => {
  it("accepts the four-route evidence bundle specified by the platform plan", () => {
    const result = evidenceBundleV1Schema.safeParse({
      schemaVersion: "1.0",
      request: { action: "career_exploration" },
      profileSnapshot: { available: true, version: 7, data: { targetRole: "data_analyst" } },
      historySnapshot: { available: true, through: "message-9", data: [] },
      careerBaseline: { roleKey: "data_analyst", templateVersion: "2026.07", evidence: [] },
      marketEvidence,
    });
    expect(result.success).toBe(true);
  });

  it("requires an actual market search or a non-empty skip reason", () => {
    const common = {
      schemaVersion: "1.0",
      request: {},
      profileSnapshot: { available: false, version: null, data: null },
      historySnapshot: { available: false, through: null, data: null },
      careerBaseline: { roleKey: "data_analyst", templateVersion: "2026.07", evidence: [] },
    };
    expect(evidenceBundleV1Schema.safeParse({
      ...common,
      marketEvidence: { ...marketEvidence, searched: false, skipReason: null },
    }).success).toBe(false);
    expect(evidenceBundleV1Schema.safeParse({
      ...common,
      marketEvidence: { ...marketEvidence, searched: false, skipReason: "No market search requested" },
    }).success).toBe(true);
  });

  it("requires serializable JSON data in every snapshot and artifact", () => {
    const evidence = {
      schemaVersion: "1.0",
      request: {},
      profileSnapshot: { available: true, version: 1, data: {} },
      historySnapshot: { available: true, through: "message-1", data: [] },
      careerBaseline: { roleKey: "data_analyst", templateVersion: "2026.07", evidence: [] },
      marketEvidence,
    };
    const artifact = {
      schemaVersion: "1.0",
      taskType: "career_plan",
      status: "success",
      summary: "A plan was generated.",
      data: {},
      evidence: [],
      sources: [],
      assumptions: [],
      warnings: [],
      requiresUserConfirmation: false,
      baseVersion: 1,
      nextActions: [],
    };

    const { data: _profileData, ...withoutProfileData } = evidence.profileSnapshot;
    const { data: _historyData, ...withoutHistoryData } = evidence.historySnapshot;
    const { data: _artifactData, ...withoutArtifactData } = artifact;

    expect(evidenceBundleV1Schema.safeParse({
      ...evidence,
      profileSnapshot: withoutProfileData,
    }).success).toBe(false);
    expect(evidenceBundleV1Schema.safeParse({
      ...evidence,
      historySnapshot: withoutHistoryData,
    }).success).toBe(false);
    expect(agentArtifactV1Schema.safeParse(withoutArtifactData).success).toBe(false);
    expect(evidenceBundleV1Schema.safeParse({
      ...evidence,
      profileSnapshot: { ...evidence.profileSnapshot, data: new Date() },
    }).success).toBe(false);
    expect(agentArtifactV1Schema.safeParse({ ...artifact, data: () => "not JSON" }).success).toBe(false);
  });

  it("accepts only platform-plan artifact task types and statuses, with optional id", () => {
    const value = {
      schemaVersion: "1.0",
      taskType: "learning_route",
      status: "pending_confirmation",
      summary: "Confirm the proposed learning route.",
      data: { weeks: 12 },
      evidence: [],
      sources: [],
      assumptions: [],
      warnings: [],
      requiresUserConfirmation: true,
      baseVersion: null,
      nextActions: [],
    };
    expect(agentArtifactV1Schema.safeParse(value).success).toBe(true);
    expect(agentArtifactV1Schema.safeParse({ ...value, taskType: "research" }).success).toBe(false);
    expect(agentArtifactV1Schema.safeParse({ ...value, status: "draft" }).success).toBe(false);
    expect(agentArtifactV1Schema.safeParse({ ...value, baseVersion: "3" }).success).toBe(false);
  });

  it("keeps research reports independent from private evidence bundles", () => {
    const value = {
      schemaVersion: "1.0",
      topic: "Entry-level data analyst roles",
      collectedAt: "2026-07-21T00:00:00.000Z",
      queryScope: { region: "CN", experienceLevel: "entry", timeRange: "2026-Q3" },
      findings: [],
      sources: [],
      conflicts: [],
      confidence: "high",
      limitations: [],
    };
    expect(researchReportV1Schema.safeParse(value).success).toBe(true);
    expect(researchReportV1Schema.safeParse({ ...value, evidence: marketEvidence }).success).toBe(false);
  });

  it("validates the platform review verdict and required decision fields", () => {
    const value = {
      schemaVersion: "1.0",
      verdict: "revise",
      issues: [],
      requiredChanges: ["Add a source for salary expectations."],
      riskFlags: [],
      confirmationRequired: true,
    };
    expect(reviewReportV1Schema.safeParse(value).success).toBe(true);
    expect(reviewReportV1Schema.safeParse({ ...value, verdict: "approved" }).success).toBe(false);
    expect(reviewReportV1Schema.safeParse({ verdict: "pass", issues: [], requiredChanges: [], riskFlags: [] }).success).toBe(false);
  });
});
