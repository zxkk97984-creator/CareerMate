import { describe, expect, it } from "vitest";
import { resolveSettingsTab, settingsTabs } from "./settings-tabs";

describe("resolveSettingsTab", () => {
  it("defaults to the account tab when no tab param is present", () => {
    expect(resolveSettingsTab(null)).toBe("account");
    expect(resolveSettingsTab(undefined)).toBe("account");
  });

  it("accepts a known tab id", () => {
    expect(resolveSettingsTab("account")).toBe("account");
    expect(resolveSettingsTab("appearance")).toBe("appearance");
    expect(resolveSettingsTab("privacy")).toBe("privacy");
  });

  it("falls back to account for an unknown id", () => {
    expect(resolveSettingsTab("garbage")).toBe("account");
    expect(resolveSettingsTab("")).toBe("account");
  });

  it("exposes the three documented tabs", () => {
    expect(settingsTabs.map((t) => t.id)).toEqual(["account", "appearance", "privacy"]);
  });
});
