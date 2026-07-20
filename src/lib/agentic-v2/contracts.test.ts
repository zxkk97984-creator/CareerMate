import { describe, expect, it } from "vitest";
import {
  agentArtifactV1Schema,
  businessDataV1Schema,
  evidenceBundleV1Schema,
  researchReportV1Schema,
  reviewReportV1Schema,
} from "./contracts";

describe("Agentic V2 contracts", () => {
  it("accepts valid business data but rejects fields outside the contract", () => {
    const value = {
      schemaVersion: "1",
      careermate_context_token: "signed-context-token",
      interaction: { surface: "chat", action: "research", targetRef: "role:database-administrator" },
    };
    expect(businessDataV1Schema.safeParse(value).success).toBe(true);
    expect(businessDataV1Schema.safeParse({ ...value, profile: { resume: "private" } }).success).toBe(false);
  });

  it("requires every evidence route and a searched market or skip reason", () => {
    const valid = {
      schemaVersion: "1",
      profile: { facts: [] },
      history: { entries: [] },
      resources: { items: [] },
      market: { searched: false, skipReason: "Search disabled for this request" },
    };
    expect(evidenceBundleV1Schema.safeParse(valid).success).toBe(true);
    expect(evidenceBundleV1Schema.safeParse({ ...valid, market: { searched: false } }).success).toBe(false);
    expect(evidenceBundleV1Schema.safeParse({ profile: valid.profile, history: valid.history, resources: valid.resources, market: valid.market }).success).toBe(false);
  });

  it("validates agent artifact task/status enums and confirmation metadata", () => {
    const valid = {
      schemaVersion: "1",
      id: "artifact-1",
      title: "DBA research",
      taskType: "research",
      status: "draft",
      requiresUserConfirmation: true,
      baseVersion: 3,
      nextActions: [{ label: "Review research", action: "review" }],
    };
    expect(agentArtifactV1Schema.safeParse(valid).success).toBe(true);
    expect(agentArtifactV1Schema.safeParse({ ...valid, taskType: "delete_everything" }).success).toBe(false);
    expect(agentArtifactV1Schema.safeParse({ ...valid, status: "unknown" }).success).toBe(false);
  });

  it("validates research and review reports", () => {
    expect(researchReportV1Schema.safeParse({
      schemaVersion: "1",
      title: "DBA role research",
      summary: "A current market overview.",
      findings: [{ claim: "SQL is required", evidenceRefs: ["market-1"] }],
      evidence: { schemaVersion: "1", profile: { facts: [] }, history: { entries: [] }, resources: { items: [] }, market: { searched: true } },
    }).success).toBe(true);
    expect(reviewReportV1Schema.safeParse({
      schemaVersion: "1",
      artifactId: "artifact-1",
      status: "approved",
      summary: "Ready for the user.",
      issues: [],
    }).success).toBe(true);
    expect(reviewReportV1Schema.safeParse({ schemaVersion: "1", artifactId: "artifact-1", status: "maybe", summary: "x", issues: [] }).success).toBe(false);
  });
});
