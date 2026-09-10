import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(path); }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/components/chat/chat-home", () => ({ ChatHomePage: () => null }));
import ChatPage from "./page";
beforeEach(() => vi.clearAllMocks());
describe("primary chat entry", () => {
  it("requires authentication", async () => {
    mocks.user.mockResolvedValue(null);
    await expect(ChatPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("/login");
  });
  it("renders the current user's chat page", async () => {
    mocks.user.mockResolvedValue({ id: "u1", displayName: "小林", role: "user", profile: { onboardingCompleted: true } });
    const page = await ChatPage({ searchParams: Promise.resolve({ jobId: "job-1", intent: "job-gap" }) });
    expect(page.props).toMatchObject({ userId: "u1", displayName: "小林" });
    expect(page.props).toMatchObject({ jobId: "job-1", jobIntent: "job-gap" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
