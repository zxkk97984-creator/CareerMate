import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  compare: vi.fn(),
  setSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ user: { findUnique: mocks.findUnique } }) }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));
vi.mock("@/lib/auth", () => ({ setSession: mocks.setSession }));

const { POST } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setSession.mockResolvedValue(undefined);
});

function req(body: string) {
  return new Request("http://localhost/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body });
}

describe("POST /api/auth/login（T23a）", () => {
  it("returns 400 for malformed JSON instead of a raw 500", async () => {
    const res = await POST(req("{not json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_JSON");
  });

  it("returns 401 for wrong credentials without revealing which field is wrong", async () => {
    mocks.findUnique.mockResolvedValue({ passwordHash: "hashed", profile: null });
    mocks.compare.mockResolvedValue(false);
    const res = await POST(req(JSON.stringify({ username: "alice", password: "wrong" })));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).not.toContain("alice");
  });
});
