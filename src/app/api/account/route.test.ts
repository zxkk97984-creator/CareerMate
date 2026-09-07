import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({ user: { update: mocks.update } }),
}));

const { PATCH } = await import("./route");

const currentUser = { id: "user-1", username: "alice", displayName: "Alice", role: "user" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue(currentUser);
  mocks.update.mockResolvedValue({ ...currentUser, avatarDataUrl: null });
});

function req(body: string) {
  return new Request("http://localhost/api/account", { method: "PATCH", headers: { "content-type": "application/json" }, body });
}

describe("PATCH /api/account", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("UNAUTHORIZED"));
    const res = await PATCH(req(JSON.stringify({ displayName: "Bob" })));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("updates displayName and returns the refreshed user DTO", async () => {
    mocks.update.mockResolvedValue({ ...currentUser, displayName: "Bob", avatarDataUrl: null });
    const res = await PATCH(req(JSON.stringify({ displayName: "Bob" })));
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.data.user).toMatchObject({ displayName: "Bob", avatarDataUrl: null });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { displayName: "Bob" },
    });
  });

  it("rejects an empty update", async () => {
    const res = await PATCH(req(JSON.stringify({})));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a non-image avatar data URL", async () => {
    const res = await PATCH(req(JSON.stringify({ avatarDataUrl: "data:text/plain;base64,AAAA" })));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("头像");
  });

  it("accepts a valid PNG data URL", async () => {
    mocks.update.mockResolvedValue({ ...currentUser, avatarDataUrl: "data:image/png;base64,iVBORw0KGgo=" });
    const res = await PATCH(req(JSON.stringify({ avatarDataUrl: "data:image/png;base64,iVBORw0KGgo=" })));
    expect(res.status).toBe(200);
    expect((await res.json()).data.user.avatarDataUrl).toContain("image/png");
  });
});
