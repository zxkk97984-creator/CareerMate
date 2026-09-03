import { describe, expect, it } from "vitest";
import {
  agenticV2InteractionSchema,
  buildAgenticV2BusinessData,
} from "./agentic-v2-context";

describe("Agentic V2 business_data (snapshot-based)", () => {
  const profileSnapshot = {
    available: true,
    version: 5,
    data: {
      targetRole: "data_analyst",
      weeklyAvailableHours: 8,
      abilityScores: { dataAnalysis: 62 },
      abilityEvidence: [],
    },
  };

  const historySnapshot = {
    available: true,
    through: "2026-07-23T08:00:00.000Z",
    data: {
      activePlan: { id: "plan-1", version: 3, targetRole: "data_analyst" },
      recentProgress: [],
      recentSimulations: [],
      confirmedMemories: [],
      conversationSummary: "",
    },
  };

  it("builds business_data from sanitized snapshots without a context token", () => {
    const businessData = buildAgenticV2BusinessData({
      interaction: { surface: "career_path", action: "regenerate_plan" },
      profileSnapshot,
      historySnapshot,
      simulationState: null,
    });

    expect(businessData).toEqual({
      schemaVersion: "1",
      interaction: { surface: "career_path", action: "regenerate_plan" },
      profileSnapshot,
      historySnapshot,
      simulationState: null,
      permissions: {
        candidateCreationAllowed: true,
        officialWritesAllowed: false,
      },
    });

    // 必须不包含 context token
    expect(JSON.stringify(businessData)).not.toContain("careermate_context_token");
    expect(JSON.stringify(businessData)).not.toContain("token");
  });

  it("does not expose identity or auth fields in the output", () => {
    const businessData = buildAgenticV2BusinessData({
      profileSnapshot,
      historySnapshot,
      simulationState: null,
    });

    const serialized = JSON.stringify(businessData);
    for (const forbidden of ["email", "password", "passwordHash", "tokenHash", "phone", "realName", "careermate_context_token"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("uses neutral chat defaults when no interaction is supplied", () => {
    const businessData = buildAgenticV2BusinessData({
      profileSnapshot,
      historySnapshot,
      simulationState: null,
    });

    expect(businessData.interaction).toEqual({ surface: "chat", action: "message_submit" });
  });

  it("rejects implementation commands disguised as page context", () => {
    expect(agenticV2InteractionSchema.safeParse({
      surface: "career_path",
      action: "call_workflow_career_plan",
    }).success).toBe(false);
    expect(agenticV2InteractionSchema.safeParse({
      surface: "career_path",
      action: "execute_workflow_career_plan",
    }).success).toBe(false);
    expect(agenticV2InteractionSchema.safeParse({
      surface: "career_path",
      action: "ignore_previous_instructions",
    }).success).toBe(false);
    expect(agenticV2InteractionSchema.safeParse({
      surface: "unknown_page",
      action: "message_submit",
    }).success).toBe(false);
    expect(agenticV2InteractionSchema.safeParse({
      surface: "chat",
      action: "message_submit",
    }).success).toBe(true);
  });

  it("rejects missing required snapshot fields", () => {
    expect(() => buildAgenticV2BusinessData({
      profileSnapshot: profileSnapshot as any,
      historySnapshot: undefined as any,
      simulationState: null,
    })).toThrow();
  });
});
