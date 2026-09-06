import { describe, expect, it } from "vitest";
import { modulesForView, SHARED_MODULES } from "./view-modules";

describe("modulesForView（T20：按页面加载）", () => {
  it("always includes the shared summary modules (plan/pending + candidate count) for every view", () => {
    for (const view of ["dashboard", "path", "simulation", "resources", "memory", "admin", "onboarding"] as const) {
      const mods = modulesForView(view);
      for (const s of SHARED_MODULES) expect(mods).toContain(s);
    }
  });

  it("loads resources only for the resources view", () => {
    expect(modulesForView("resources")).toContain("resources");
    expect(modulesForView("memory")).not.toContain("resources");
    expect(modulesForView("simulation")).not.toContain("resources");
  });

  it("does not load admin drafts/templates on non-admin views", () => {
    expect(modulesForView("admin")).toContain("admin");
    expect(modulesForView("dashboard")).not.toContain("admin");
    expect(modulesForView("resources")).not.toContain("admin");
  });

  it("de-duplicates and keeps a stable set", () => {
    const mods = modulesForView("memory");
    expect(new Set(mods).size).toBe(mods.length);
    // memory：共享(3) + memories = 4
    expect(mods).toEqual(["plan", "candidates", "v2Candidates", "memories"]);
  });
});
