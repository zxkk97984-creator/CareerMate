import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  compare: vi.fn(),
  hash: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({ user: { findUnique: mocks.findUnique, update: mocks.update } }),
}));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare, hash: mocks.hash } }));

const { POST } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
  mocks.findUnique.mockResolvedValue({ passwordHash: "old-hash" });
  mocks.compare.mockResolvedValue(true);
  mocks.hash.mockResolvedValue("new-hash");
  mocks.update.mockResolvedValue({ id: "user-1" });
});

function req(body: string) {
  return new Request("http://localhost/api/account/password", { method: "POST", headers: { "content-type": "application/json" }, body });
}

describe("POST /api/account/password", () => {
  it("rejects a wrong current password", async () => {
    mocks.compare.mockResolvedValue(false);
    const res = await POST(req(JSON.stringify({ currentPassword: "wrong", newPassword: "newpass1" })));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("CONFIRMATION_MISMATCH");
  });

  it("changes the password and verifies bcrypt round-trip call", async () => {
    const res = await POST(req(JSON.stringify({ currentPassword: "oldpass", newPassword: "newpass1" })));
    expect(res.status).toBe(200);
    expect(mocks.compare).toHaveBeenCalledWith("oldpass", "old-hash");
    expect(mocks.hash).toHaveBeenCalledWith("newpass1", 10);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { passwordHash: "new-hash" },
    });
  });

  it("rejects a too-short new password", async () => {
    const res = await POST(req(JSON.stringify({ currentPassword: "oldpass", newPassword: "123" })));
    expect(res.status).toBe(400);
  });

  it("rejects reusing the current password", async () => {
    const res = await POST(req(JSON.stringify({ currentPassword: "samepass", newPassword: "samepass" })));
    expect(res.status).toBe(400);
  });
});
