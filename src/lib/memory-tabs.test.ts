import { describe, expect, it } from "vitest";
import { resolveMemoryTab, memoryTabs } from "./memory-tabs";

describe("resolveMemoryTab（T18 深链接标签）", () => {
  it("defaults to the candidates tab when no tab param is present", () => {
    expect(resolveMemoryTab(null)).toBe("candidates");
    expect(resolveMemoryTab(undefined)).toBe("candidates");
  });

  it("accepts a known tab id", () => {
    expect(resolveMemoryTab("profile")).toBe("profile");
    expect(resolveMemoryTab("privacy")).toBe("privacy");
    expect(resolveMemoryTab("candidates")).toBe("candidates");
  });

  it("falls back to candidates for an unknown id (safe deep-link)", () => {
    expect(resolveMemoryTab("garbage")).toBe("candidates");
    expect(resolveMemoryTab("")).toBe("candidates");
  });

  it("exposes the three documented tabs", () => {
    expect(memoryTabs.map((t) => t.id)).toEqual(["candidates", "profile", "privacy"]);
  });
});
