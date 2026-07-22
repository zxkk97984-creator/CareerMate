import { describe, expect, it } from "vitest";
import { verifyCareerMateContextToken } from "@/lib/agent-context-auth";
import {
  agenticV2InteractionSchema,
  buildAgenticV2BusinessData,
} from "./agentic-v2-context";

const signingKey = "test-agentic-v2-business-data-key-at-least-32-bytes";

describe("Agentic V2 business_data", () => {
  it("contains only a short-lived capability token and observational interaction context", () => {
    const businessData = buildAgenticV2BusinessData({
      userId: "user-42",
      conversationId: "conversation-9",
      clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
      interaction: { surface: "career_path", action: "regenerate_plan" },
    }, {
      secret: signingKey,
      now: () => 1_700_000_000,
    });

    expect(businessData).toEqual({
      schemaVersion: "1",
      careermate_context_token: expect.any(String),
      interaction: { surface: "career_path", action: "regenerate_plan" },
    });
    expect(JSON.stringify(businessData)).not.toContain("profile");
    expect(JSON.stringify(businessData)).not.toContain("resume");

    const claims = verifyCareerMateContextToken(businessData.careermate_context_token, {
      secret: signingKey,
      now: () => 1_700_000_001,
    });
    expect(claims).toMatchObject({
      sub: "user-42",
      sid: "conversation-9",
      jti: "550e8400-e29b-41d4-a716-446655440000",
      scopes: [
        "profile:read",
        "history:read",
        "resources:read",
        "candidates:create",
        "simulation:append",
      ],
    });
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(600);
  });

  it("uses neutral chat defaults when a page supplies no interaction", () => {
    const businessData = buildAgenticV2BusinessData({
      userId: "user-42",
      conversationId: "conversation-9",
      clientRequestId: "550e8400-e29b-41d4-a716-446655440001",
    }, { secret: signingKey });

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
});
