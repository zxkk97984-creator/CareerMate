import { describe, expect, it } from "vitest";
import { createSessionCredentials, hashSessionToken } from "./session-security";

describe("session credentials", () => {
  it("creates a 256-bit URL-safe random token", () => {
    const tokens = Array.from({ length: 16 }, () => createSessionCredentials().token);

    expect(tokens).toHaveLength(new Set(tokens).size);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it("stores a SHA-256 hash instead of the raw token", () => {
    expect(hashSessionToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );

    const credentials = createSessionCredentials(new Date("2026-07-10T00:00:00.000Z"));
    expect(credentials.tokenHash).toBe(hashSessionToken(credentials.token));
    expect(credentials.tokenHash).not.toContain(credentials.token);
    expect(credentials.expiresAt.toISOString()).toBe("2026-07-17T00:00:00.000Z");
  });
});
