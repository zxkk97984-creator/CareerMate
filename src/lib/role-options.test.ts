import { describe, expect, it } from "vitest";
import { buildRoleOptions, roleLabelFor } from "./role-options";

describe("role-options", () => {
  it("maps known seed roles to canonical labels", () => {
    expect(roleLabelFor("data_analyst")).toBe("数据分析师");
    expect(roleLabelFor("database_administrator")).toBe("数据库管理员（DBA）");
  });

  it("uses the profile label for the current custom target role", () => {
    expect(roleLabelFor("custom_1a2b3c4d", { targetRole: "custom_1a2b3c4d", targetRoleLabel: "合规工程师" })).toBe("合规工程师");
  });

  it("never returns a blank label for an unknown key", () => {
    expect(roleLabelFor("custom_deadbeef")).toBeTruthy();
    expect(roleLabelFor("some_unknown_role")).toBe("some_unknown_role");
  });

  it("builds role options from seed + profile + resource keys, de-duplicated", () => {
    const options = buildRoleOptions(
      { targetRole: "custom_abc", targetRoleLabel: "合规工程师" },
      ["data_analyst", "custom_abc", "aigc_operator"],
    );
    const keys = options.map((o) => o.key);
    expect(keys).toContain("data_analyst");
    expect(keys).toContain("aigc_operator");
    expect(keys).toContain("custom_abc");
    // 去重
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps every option non-empty so no blank <option> appears", () => {
    const options = buildRoleOptions({ targetRole: null }, []);
    expect(options.every((o) => o.label.trim().length > 0)).toBe(true);
  });
});
