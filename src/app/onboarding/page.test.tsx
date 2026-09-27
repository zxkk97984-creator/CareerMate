import { expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn((url: string) => { throw new Error(url); }));
vi.mock("next/navigation", () => ({ redirect }));
import OnboardingPage from "./page";

it("keeps old onboarding links working through the authenticated primary chat", () => {
  expect(() => OnboardingPage()).toThrow("/chat?intent=profile");
  expect(redirect).toHaveBeenCalledWith("/chat?intent=profile");
});
