import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compare: vi.fn(),
  hash: vi.fn(),
  setSession: vi.fn(),
  userCreate: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare, hash: mocks.hash } }));
vi.mock("@/lib/auth", () => ({ setSession: mocks.setSession }));
vi.mock("@/lib/dto", () => ({ userDto: (user: unknown) => user }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    user: { create: mocks.userCreate, findUnique: mocks.userFindUnique },
  }),
}));

import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { onboardingDestination } from "./onboarding-routing";

function request(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hash.mockResolvedValue("hash");
  mocks.compare.mockResolvedValue(true);
});

describe("onboarding routing", () => {
  it("routes incomplete or missing profiles to onboarding and completed profiles to the requested page", () => {
    expect(onboardingDestination(null)).toBe("/onboarding");
    expect(onboardingDestination({ onboardingCompleted: false }, "/dashboard")).toBe("/onboarding");
    expect(onboardingDestination({ onboardingCompleted: true }, "/dashboard")).toBe("/dashboard");
  });

  it("creates registration profiles as incomplete and returns onboarding as the next path", async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.userCreate.mockResolvedValue({ id: "user-new", username: "new_user", displayName: "新人", role: "user" });

    const response = await register(request("http://localhost/api/auth/register", {
      username: "new_user",
      displayName: "新人",
      password: "secret123",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: { nextPath: "/" } });
    expect(mocks.userCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        profile: {
          create: expect.objectContaining({ onboardingCompleted: false }),
        },
      }),
    });
  });

  it.each([
    [false, "/onboarding"],
    [true, "/"],
  ])("returns a profile-aware next path after login", async (onboardingCompleted, nextPath) => {
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      username: "student",
      displayName: "学生",
      role: "user",
      passwordHash: "hash",
      profile: { onboardingCompleted },
    });

    const response = await login(request("http://localhost/api/auth/login", {
      username: "student",
      password: "secret123",
    }));

    expect(await response.json()).toMatchObject({ ok: true, data: { nextPath } });
    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { username: "student" },
      include: { profile: true },
    });
  });
});
