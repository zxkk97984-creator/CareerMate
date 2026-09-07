import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(() => {
    // Next.js 的 redirect 会抛出 NEXT_REDIRECT；用抛错模拟真实行为，使后续守卫代码不再执行
    const err = new Error("NEXT_REDIRECT") as Error & { digest?: string };
    err.digest = "NEXT_REDIRECT;replace;/login";
    throw err;
  }),
  getCurrentUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));

vi.mock("@/components/workspace", () => ({
  Workspace: ({ initialView }: { initialView: string }) => <div data-testid="workspace" data-view={initialView} />,
}));

import { WorkspacePage } from "./workspace-page";

const fullProfile = {
  onboardingCompleted: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorkspacePage guards", () => {
  it("redirects unauthenticated users to /login", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await expect(WorkspacePage({ view: "dashboard" })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("redirects an incomplete-profile user away from non-onboarding views to onboarding", async () => {
    mocks.getCurrentUser.mockResolvedValue({ profile: { onboardingCompleted: false }, role: "user" });
    await expect(WorkspacePage({ view: "dashboard" })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/onboarding");
  });

  it("allows an incomplete-profile user to continue onboarding", async () => {
    mocks.getCurrentUser.mockResolvedValue({ profile: { onboardingCompleted: false }, role: "user" });
    const element = await WorkspacePage({ view: "onboarding" });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(element?.props["initialView"]).toBe("onboarding");
  });

  it("renders the requested view for a completed-profile user", async () => {
    mocks.getCurrentUser.mockResolvedValue({ profile: fullProfile, role: "user" });
    const element = await WorkspacePage({ view: "path" });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(element?.props["initialView"]).toBe("path");
  });

  it("redirects a non-admin user away from the admin view to the home destination", async () => {
    mocks.getCurrentUser.mockResolvedValue({ profile: fullProfile, role: "user" });
    await expect(WorkspacePage({ view: "admin" })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/chat");
  });

  it("allows an admin user to render the admin view", async () => {
    mocks.getCurrentUser.mockResolvedValue({ profile: fullProfile, role: "admin" });
    const element = await WorkspacePage({ view: "admin" });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(element?.props["isAdmin"]).toBe(true);
  });
});
