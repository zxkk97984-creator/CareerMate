import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSession, getCurrentUser, sessionCookieName, setSession } from "./auth";
import { hashSessionToken, sessionMaxAgeSeconds } from "./session-security";

const mocks = vi.hoisted(() => ({
  cookieDelete: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  sessionCreate: vi.fn(),
  sessionDeleteMany: vi.fn(),
  sessionFindFirst: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    delete: mocks.cookieDelete,
    get: mocks.cookieGet,
    set: mocks.cookieSet,
  })),
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    authSession: {
      create: mocks.sessionCreate,
      deleteMany: mocks.sessionDeleteMany,
      findFirst: mocks.sessionFindFirst,
    },
  }),
}));

const now = new Date("2026-07-10T00:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("server sessions", () => {
  it("stores only the token hash and puts the raw token in a secure production cookie", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await setSession("user-1");

    const [cookieName, rawToken, cookieOptions] = mocks.cookieSet.mock.calls[0];
    const createData = mocks.sessionCreate.mock.calls[0][0].data;

    expect(cookieName).toBe(sessionCookieName);
    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookieOptions).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: sessionMaxAgeSeconds,
    });
    expect(createData).toEqual({
      userId: "user-1",
      tokenHash: hashSessionToken(rawToken),
      expiresAt: new Date("2026-07-17T00:00:00.000Z"),
    });
    expect(JSON.stringify(createData)).not.toContain(rawToken);
  });

  it("removes expired sessions when creating a new one", async () => {
    await setSession("user-1");

    expect(mocks.sessionDeleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lte: now } },
    });
    expect(mocks.sessionDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sessionCreate.mock.invocationCallOrder[0],
    );
  });

  it("resolves the user for a valid non-expired session", async () => {
    const rawToken = "valid-session-token";
    const user = { id: "user-1", profile: { userId: "user-1" } };
    mocks.cookieGet.mockReturnValue({ value: rawToken });
    mocks.sessionFindFirst.mockResolvedValue({ user });

    await expect(getCurrentUser()).resolves.toEqual(user);
    expect(mocks.sessionFindFirst).toHaveBeenCalledWith({
      where: {
        tokenHash: hashSessionToken(rawToken),
        expiresAt: { gt: now },
      },
      include: {
        user: { include: { profile: true } },
      },
    });
  });

  it.each([
    ["expired", "expired-session-token"],
    ["unknown", "unknown-session-token"],
    ["legacy user-id", "cm_legacy_user_id"],
  ])("returns null for an %s cookie", async (_kind, rawToken) => {
    mocks.cookieGet.mockReturnValue({ value: rawToken });
    mocks.sessionFindFirst.mockResolvedValue(null);

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(mocks.sessionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tokenHash: hashSessionToken(rawToken),
          expiresAt: { gt: now },
        },
      }),
    );
  });

  it("deletes the hashed server session and clears the cookie", async () => {
    const rawToken = "logout-session-token";
    mocks.cookieGet.mockReturnValue({ value: rawToken });

    await clearSession();

    expect(mocks.sessionDeleteMany).toHaveBeenCalledWith({
      where: { tokenHash: hashSessionToken(rawToken) },
    });
    expect(mocks.cookieDelete).toHaveBeenCalledWith(sessionCookieName);
  });
});
