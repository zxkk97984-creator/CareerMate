import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), dashboard: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.auth }));
vi.mock("@/lib/dashboard/service", () => ({ getDashboard: mocks.dashboard }));
import { GET } from "./route";

beforeEach(() => vi.resetAllMocks());
describe("GET /api/dashboard", () => {
  it("rejects unauthenticated requests without reading data", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(mocks.dashboard).not.toHaveBeenCalled();
  });
  it("uses the authenticated user and disables shared caching", async () => {
    const user = { id: "owner", profile: null };
    mocks.auth.mockResolvedValue(user);
    mocks.dashboard.mockResolvedValue({ planId: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(mocks.dashboard).toHaveBeenCalledWith(user);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("returns a recoverable error instead of fake empty data", async () => {
    mocks.auth.mockResolvedValue({ id: "owner", profile: null });
    mocks.dashboard.mockRejectedValue(new Error("private database detail"));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private database detail");
  });
});
