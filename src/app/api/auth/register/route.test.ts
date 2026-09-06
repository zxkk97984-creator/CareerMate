import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  hash: vi.fn(),
  setSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ user: { findUnique: mocks.findUnique, create: mocks.create } }) }));
vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));
vi.mock("@/lib/auth", () => ({ setSession: mocks.setSession }));

const { POST } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue(null);
  mocks.create.mockResolvedValue({ id: "u-1", username: "alice", displayName: "Alice", role: "user" });
  mocks.hash.mockResolvedValue("hashed");
  mocks.setSession.mockResolvedValue(undefined);
});

function req(body: string) {
  return new Request("http://localhost/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body });
}

describe("POST /api/auth/register（T23a）", () => {
  it("returns 400 for malformed JSON instead of a raw 500", async () => {
    const res = await POST(req("{bad json"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_JSON");
  });

  it("returns 400 for a username that already exists", async () => {
    mocks.findUnique.mockResolvedValue({ id: "u-0" });
    const res = await POST(req(JSON.stringify({ username: "alice", displayName: "Alice", password: "secret1" })));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("用户名已存在");
  });

  it("T23a: turns a concurrent unique-key (P2002) race into a stable 400, not a raw error", async () => {
    const err = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    mocks.create.mockRejectedValue(err);
    const res = await POST(req(JSON.stringify({ username: "alice", displayName: "Alice", password: "secret1" })));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("用户名已存在");
  });

  it("does not leak a non-conflict database error as a client-facing message", async () => {
    mocks.create.mockRejectedValue(new Error("db down"));
    await expect(POST(req(JSON.stringify({ username: "alice", displayName: "Alice", password: "secret1" })))).rejects.toThrow("db down");
  });
});
