import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));

// LandingPage 是真实组件，这里仅验证未登录时渲染它；mock 掉以减少对渲染细节的依赖
vi.mock("@/components/landing-page", () => ({
  LandingPage: () => <div data-testid="landing">landing</div>,
}));

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HomePage from "./page";

function completedProfile() {
  return { onboardingCompleted: true };
}

function incompleteProfile() {
  return { onboardingCompleted: false };
}

function renderHome() {
  return HomePage() as Promise<ReactElement | undefined>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("home (/) routing", () => {
  it("renders the landing page when not logged in", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const element = await renderHome();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(element as ReactElement)).toContain("landing");
  });

  it("routes a logged-in user with a completed profile to the dashboard", async () => {
    mocks.getCurrentUser.mockResolvedValue({ profile: completedProfile() });
    await renderHome();
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("routes a logged-in user with an incomplete profile to onboarding", async () => {
    mocks.getCurrentUser.mockResolvedValue({ profile: incompleteProfile() });
    await renderHome();
    expect(mocks.redirect).toHaveBeenCalledWith("/onboarding");
  });

  it("routes a logged-in user with a missing profile to onboarding", async () => {
    mocks.getCurrentUser.mockResolvedValue({ profile: null });
    await renderHome();
    expect(mocks.redirect).toHaveBeenCalledWith("/onboarding");
  });
});
