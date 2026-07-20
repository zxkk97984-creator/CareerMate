import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getCareerMateContextTokenSecret } from "@/lib/env";

export const CAREERMATE_CONTEXT_TOKEN_SCOPES = [
  "profile:read",
  "history:read",
  "resources:read",
  "candidates:create",
  "simulation:append",
] as const;

export type CareerMateContextTokenScope = (typeof CAREERMATE_CONTEXT_TOKEN_SCOPES)[number];

const contextTokenClaimsSchema = z.object({
  schemaVersion: z.literal("1"),
  sub: z.string().trim().min(1).max(256),
  sid: z.string().trim().min(1).max(256),
  scopes: z.array(z.enum(CAREERMATE_CONTEXT_TOKEN_SCOPES)).min(1).max(CAREERMATE_CONTEXT_TOKEN_SCOPES.length),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
  jti: z.string().trim().min(1).max(256),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.scopes).size !== value.scopes.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scopes"], message: "Scopes must be unique" });
  }
});

const contextTokenSigningInputSchema = z.object({
  sub: z.string().trim().min(1).max(256),
  sid: z.string().trim().min(1).max(256),
  scopes: z.array(z.enum(CAREERMATE_CONTEXT_TOKEN_SCOPES)).min(1).max(CAREERMATE_CONTEXT_TOKEN_SCOPES.length),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.scopes).size !== value.scopes.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scopes"], message: "Scopes must be unique" });
  }
});

export type CareerMateContextTokenClaims = z.infer<typeof contextTokenClaimsSchema>;
export interface CareerMateContextTokenSigningInput {
  sub: string;
  sid: string;
  scopes: readonly CareerMateContextTokenScope[];
}

export interface ContextTokenOptions {
  /** Server-only secret. Defaults to CAREERMATE_CONTEXT_TOKEN_SECRET. */
  secret?: string;
  /** Epoch seconds, epoch milliseconds, or a Date; injectable for deterministic tests. */
  now?: () => number | Date;
}

export interface ContextTokenSignOptions extends ContextTokenOptions {
  ttlSeconds?: number;
  randomUUID?: () => string;
}

export class CareerMateContextTokenError extends Error {
  constructor(message: "Invalid context token" | "Context token expired" | "Invalid context token claims" | "Context token TTL must not exceed 600 seconds" | "Context token secret is not configured" | "Context token secret is invalid") {
    super(message);
    this.name = "CareerMateContextTokenError";
  }
}

const MAX_TTL_SECONDS = 600;
const DEFAULT_TTL_SECONDS = 300;
const MIN_CONTEXT_TOKEN_SECRET_BYTES = 32;
const KNOWN_CONTEXT_TOKEN_SECRET_PLACEHOLDERS = new Set([
  "placeholder",
  "replace-with-a-long-random-server-secret",
  "change-me",
  "your-secret-here",
]);

function getSecret(options: ContextTokenOptions): string {
  const secret = (options.secret ?? getCareerMateContextTokenSecret()).trim();
  if (!secret) throw new CareerMateContextTokenError("Context token secret is not configured");
  if (
    Buffer.byteLength(secret, "utf8") < MIN_CONTEXT_TOKEN_SECRET_BYTES
    || KNOWN_CONTEXT_TOKEN_SECRET_PLACEHOLDERS.has(secret.toLowerCase())
  ) {
    throw new CareerMateContextTokenError("Context token secret is invalid");
  }
  return secret;
}

function epochSeconds(now?: ContextTokenOptions["now"]): number {
  const value = now ? now() : Date.now();
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  const milliseconds = value;
  return Math.floor(milliseconds > 10_000_000_000 ? milliseconds / 1000 : milliseconds);
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function isCanonicalBase64url(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value)
    && Buffer.from(value, "base64url").toString("base64url") === value;
}

function invalidToken(): never {
  throw new CareerMateContextTokenError("Invalid context token");
}

/** Creates a short-lived, user-bound capability token without profile or resume data. */
export function signCareerMateContextToken(
  input: CareerMateContextTokenSigningInput,
  options: ContextTokenSignOptions = {},
): string {
  const parsed = contextTokenSigningInputSchema.safeParse(input);
  if (!parsed.success) throw new CareerMateContextTokenError("Invalid context token claims");

  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new CareerMateContextTokenError("Invalid context token claims");
  }
  if (ttlSeconds > MAX_TTL_SECONDS) {
    throw new CareerMateContextTokenError("Context token TTL must not exceed 600 seconds");
  }

  const iat = epochSeconds(options.now);
  const claims: CareerMateContextTokenClaims = {
    schemaVersion: "1",
    ...parsed.data,
    iat,
    exp: iat + ttlSeconds,
    jti: (options.randomUUID ?? crypto.randomUUID)(),
  };
  if (!contextTokenClaimsSchema.safeParse(claims).success) {
    throw new CareerMateContextTokenError("Invalid context token claims");
  }

  const encodedClaims = encode(JSON.stringify(claims));
  const signedPayload = `v1.${encodedClaims}`;
  return `${signedPayload}.${signature(signedPayload, getSecret(options))}`;
}

/** Verifies a context token and returns only its allowed, time-bounded claims. */
export function verifyCareerMateContextToken(
  token: string,
  options: ContextTokenOptions = {},
): CareerMateContextTokenClaims {
  try {
    const [version, encodedClaims, providedSignature, ...extra] = token.split(".");
    if (version !== "v1" || !encodedClaims || !providedSignature || extra.length > 0) return invalidToken();
    if (!isCanonicalBase64url(encodedClaims) || !isCanonicalBase64url(providedSignature)) return invalidToken();

    const signedPayload = `${version}.${encodedClaims}`;
    const expectedSignature = signature(signedPayload, getSecret(options));
    // Compare the canonical base64url text rather than decoded bytes: altering
    // unused trailing base64 bits must not produce another accepted spelling.
    const received = Buffer.from(providedSignature, "utf8");
    const expected = Buffer.from(expectedSignature, "utf8");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return invalidToken();

    const parsed = contextTokenClaimsSchema.safeParse(JSON.parse(decode(encodedClaims)));
    if (!parsed.success || parsed.data.exp - parsed.data.iat > MAX_TTL_SECONDS || parsed.data.exp <= parsed.data.iat) return invalidToken();

    const current = epochSeconds(options.now);
    if (parsed.data.iat > current) return invalidToken();
    if (parsed.data.exp <= current) throw new CareerMateContextTokenError("Context token expired");
    return parsed.data;
  } catch (error) {
    if (error instanceof CareerMateContextTokenError) throw error;
    return invalidToken();
  }
}
