import { describe, expect, it } from "vitest";
import { buildRoleDraftContent, roleDraftContentSchema, roleKeyFromName } from "@/lib/admin-role-draft";

describe("admin role draft", () => {
  it("creates a structured draft with traceable sources", () => {
    const content = buildRoleDraftContent("AI 客户成功", ["管理员访谈记录"]);
    expect(roleDraftContentSchema.parse(content).sources).toEqual(["管理员访谈记录"]);
    expect(content.entryRequirements.length).toBeGreaterThan(0);
    expect(Object.keys(content.abilityWeights)).toHaveLength(6);
  });

  it("rejects drafts without sources", () => {
    const content = buildRoleDraftContent("AI 客户成功", []);
    expect(roleDraftContentSchema.safeParse(content).success).toBe(false);
  });

  it("builds stable safe role keys", () => {
    expect(roleKeyFromName("AI 客户成功")).toBe("custom_ai");
    expect(roleKeyFromName("Data Analyst")).toBe("custom_data_analyst");
  });
});
