import { describe, expect, it } from "vitest";
import {
  resolveSeedRoleAlias,
  stableCustomRoleKey,
  resolveRoleIdentity,
  roleKeyFromName,
  seedRoleKeys,
} from "./identity";

describe("resolveSeedRoleAlias", () => {
  it("normalizes DBA → database_administrator", () => {
    const result = resolveSeedRoleAlias("DBA");
    expect(result).toEqual({
      key: "database_administrator",
      label: "数据库管理员（DBA）",
      normalizedLabel: "数据库管理员（DBA）",
      coverage: "verified_template",
    });
  });

  it("normalizes 数据库运维 → database_administrator", () => {
    const result = resolveSeedRoleAlias("数据库运维");
    expect(result?.key).toBe("database_administrator");
  });

  it("normalizes 数据库运维工程师 → database_administrator", () => {
    const result = resolveSeedRoleAlias("数据库运维工程师");
    expect(result?.key).toBe("database_administrator");
  });

  it("normalizes database administrator → database_administrator", () => {
    const result = resolveSeedRoleAlias("database administrator");
    expect(result?.key).toBe("database_administrator");
  });

  it("strips tail words like 方面的/方向/岗位", () => {
    const result = resolveSeedRoleAlias("数据库运维方面的");
    expect(result?.key).toBe("database_administrator");
  });

  it("returns undefined for unknown role", () => {
    expect(resolveSeedRoleAlias("供应链分析师")).toBeUndefined();
  });

  it("returns undefined for empty input", () => {
    expect(resolveSeedRoleAlias("")).toBeUndefined();
  });
});

describe("stableCustomRoleKey", () => {
  it("produces stable key for same input", () => {
    expect(stableCustomRoleKey("用户体验设计师"))
      .toBe(stableCustomRoleKey("用户体验设计师"));
  });

  it("trims whitespace", () => {
    expect(stableCustomRoleKey(" 用户体验设计师 "))
      .toBe(stableCustomRoleKey("用户体验设计师"));
  });

  it("different inputs produce different keys", () => {
    expect(stableCustomRoleKey("用户体验设计师"))
      .not.toBe(stableCustomRoleKey("供应链分析师"));
  });

  it("produces custom_ prefix", () => {
    expect(stableCustomRoleKey("UX工程师")).toMatch(/^custom_[a-f0-9]{12}$/);
  });
});

describe("resolveRoleIdentity", () => {
  it("returns verified_template for known alias", () => {
    const result = resolveRoleIdentity("DBA");
    expect(result.key).toBe("database_administrator");
    expect(result.coverage).toBe("verified_template");
  });

  it("returns custom key for unknown role", () => {
    const result = resolveRoleIdentity("供应链分析师");
    expect(result.key).toMatch(/^custom_/);
    expect(result.coverage).toBe("unverified");
  });
});

describe("roleKeyFromName", () => {
  it("returns stable key for DBA", () => {
    expect(roleKeyFromName("DBA")).toBe("database_administrator");
  });

  it("returns custom key for unknown Chinese role (not custom_ai)", () => {
    const key = roleKeyFromName("用户体验设计师");
    expect(key).toMatch(/^custom_/);
    expect(key).not.toBe("custom_ai");
  });
});

describe("seedRoleKeys", () => {
  it("contains database_administrator as seed, not whitelist", () => {
    expect(seedRoleKeys).toContain("database_administrator");
  });
});
