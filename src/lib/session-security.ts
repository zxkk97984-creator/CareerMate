import { createHash, randomBytes } from "node:crypto";

export const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createSessionCredentials(now = new Date()) {
  const token = randomBytes(32).toString("base64url");

  return {
    token,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(now.getTime() + sessionMaxAgeSeconds * 1000),
  };
}
