import { describe, expect, it } from "vitest";
import { buildPrivacyExport, isClearConfirmation } from "@/lib/privacy";

describe("privacy helpers", () => {
  it("exports business data without credentials or session secrets", () => {
    const result = buildPrivacyExport({
      user: { id: "u1", username: "demo", displayName: "Demo", role: "user", createdAt: new Date("2026-01-01"), passwordHash: "secret" },
      profile: { targetRole: "ai_product_manager" },
      memories: [{ content: "memory" }],
      plans: [], logs: [], simulations: [], candidates: [], onboardingConversations: [],
      authSessions: [{ tokenHash: "never-export" }],
    });
    const json = JSON.stringify(result);
    expect(json).toContain("memory");
    expect(json).not.toContain("passwordHash");
    expect(json).not.toContain("secret");
    expect(json).not.toContain("authSessions");
    expect(json).not.toContain("never-export");
  });

  it("requires the exact destructive confirmation phrase", () => {
    expect(isClearConfirmation("CLEAR_MY_DATA")).toBe(true);
    expect(isClearConfirmation("clear_my_data")).toBe(false);
    expect(isClearConfirmation("CLEAR_MY_DATA ")).toBe(false);
  });
});
