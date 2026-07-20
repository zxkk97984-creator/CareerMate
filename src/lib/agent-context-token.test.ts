import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  CareerMateContextTokenError,
  signCareerMateContextToken,
  verifyCareerMateContextToken,
} from "./agent-context-token";

const secret = "test-context-token-secret-with-at-least-32-bytes";
const now = () => 1_700_000_000;
const randomUUID = () => "00000000-0000-4000-8000-000000000001";
const claims = {
  sub: "user-1",
  sid: "conversation-1",
  scopes: ["profile:read", "history:read"] as const,
};

describe("CareerMate context token", () => {
  it("signs and verifies a minimal, privacy-safe context token", () => {
    const token = signCareerMateContextToken(claims, { secret, now, randomUUID });
    const verified = verifyCareerMateContextToken(token, { secret, now });

    expect(verified).toEqual({
      schemaVersion: "1",
      ...claims,
      iat: 1_700_000_000,
      exp: 1_700_000_300,
      jti: randomUUID(),
    });
    expect(token).not.toContain("resume");
    const [, encodedClaims] = token.split(".");
    expect(JSON.parse(Buffer.from(encodedClaims, "base64url").toString("utf8"))).toEqual({
      schemaVersion: "1",
      ...claims,
      iat: 1_700_000_000,
      exp: 1_700_000_300,
      jti: randomUUID(),
    });
  });

  it("rejects a tampered token with a non-revealing security error", () => {
    const token = signCareerMateContextToken(claims, { secret, now, randomUUID });
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    expect(() => verifyCareerMateContextToken(tampered, { secret, now })).toThrow(CareerMateContextTokenError);
    expect(() => verifyCareerMateContextToken(tampered, { secret, now })).toThrow("Invalid context token");
  });

  it("rejects expired tokens", () => {
    const token = signCareerMateContextToken(claims, {
      secret,
      now,
      randomUUID,
      ttlSeconds: 60,
    });

    expect(() => verifyCareerMateContextToken(token, { secret, now: () => 1_700_000_061 })).toThrow("Context token expired");
  });

  it("refuses token TTLs above ten minutes", () => {
    expect(() => signCareerMateContextToken(claims, {
      secret,
      now,
      randomUUID,
      ttlSeconds: 601,
    })).toThrow("Context token TTL must not exceed 600 seconds");
  });

  it("rejects claims with scopes outside the fixed allowlist", () => {
    expect(() => signCareerMateContextToken({ ...claims, scopes: ["profile:write"] as never }, {
      secret,
      now,
      randomUUID,
    })).toThrow("Invalid context token claims");
  });

  it("rejects a token issued in the future", () => {
    const token = signCareerMateContextToken(claims, {
      secret,
      now: () => 1_700_000_100,
      randomUUID,
    });

    expect(() => verifyCareerMateContextToken(token, { secret, now })).toThrow("Invalid context token");
  });

  it("allows only a small future clock skew and expires exactly at exp", () => {
    const token = signCareerMateContextToken(claims, {
      secret,
      now: () => 1_700_000_029,
      randomUUID,
      ttlSeconds: 600,
    });

    expect(verifyCareerMateContextToken(token, { secret, now })).toMatchObject({ exp: 1_700_000_629 });
    expect(() => verifyCareerMateContextToken(token, { secret, now: () => 1_700_000_629 }))
      .toThrow("Context token expired");
    expect(() => verifyCareerMateContextToken(token, { secret, now: () => 1_699_999_998 }))
      .toThrow("Invalid context token");
  });

  it("uses Date inputs as epoch milliseconds and rejects duplicate scopes", () => {
    const token = signCareerMateContextToken(claims, {
      secret,
      now: () => new Date(1_700_000_000_000),
      randomUUID,
    });
    expect(verifyCareerMateContextToken(token, { secret, now })).toMatchObject({ iat: 1_700_000_000 });
    expect(() => signCareerMateContextToken({ ...claims, scopes: ["profile:read", "profile:read"] }, {
      secret,
      now,
      randomUUID,
    })).toThrow("Invalid context token claims");
  });

  it("rejects wrong-secret, malformed, and non-canonical base64url tokens", () => {
    const token = signCareerMateContextToken(claims, { secret, now, randomUUID });
    expect(() => verifyCareerMateContextToken(token, {
      secret: "a-different-strong-context-token-secret-value",
      now,
    })).toThrow("Invalid context token");
    expect(() => verifyCareerMateContextToken("v1.%%%%.%%%%", { secret, now })).toThrow("Invalid context token");

    const [version, encodedClaims] = token.split(".");
    const nonCanonicalPayload = `${version}.${encodedClaims}=`;
    const signature = createHmac("sha256", secret).update(nonCanonicalPayload).digest("base64url");
    expect(() => verifyCareerMateContextToken(`${nonCanonicalPayload}.${signature}`, { secret, now }))
      .toThrow("Invalid context token");
  });

  it("rejects short and known placeholder signing secrets in every environment", () => {
    for (const weakSecret of ["", "too-short", "placeholder", "replace-with-a-long-random-server-secret"]) {
      expect(() => signCareerMateContextToken(claims, { secret: weakSecret, now, randomUUID }))
        .toThrow("Context token secret");
    }
  });
});
