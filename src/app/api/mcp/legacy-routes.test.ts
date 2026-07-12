import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPluginPrincipal: vi.fn(),
  isPluginAuthorized: vi.fn(),
  findProfile: vi.fn(),
  createCandidate: vi.fn(),
  createProgress: vi.fn(),
}));

vi.mock("@/lib/plugin-auth", () => ({
  getPluginPrincipal: mocks.getPluginPrincipal,
  isPluginAuthorized: mocks.isPluginAuthorized,
  requirePluginScope: (_request: Request, scope: string, requestedUserId?: string) => {
    const principal = mocks.getPluginPrincipal();
    if (!principal || !principal.scopes.includes(scope)) return null;
    return requestedUserId && requestedUserId !== principal.userId ? null : principal;
  },
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    userProfile: { findUnique: mocks.findProfile },
    profileUpdateCandidate: { create: mocks.createCandidate },
    progressLog: { create: mocks.createProgress },
  }),
}));

import { POST as readProfile } from "./profile/read/route";
import { POST as createCandidate } from "./profile/update-candidate/route";
import { POST as updateProgress } from "./progress/update/route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/mcp/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isPluginAuthorized.mockReturnValue(true);
  mocks.getPluginPrincipal.mockReturnValue({
    userId: "user-1",
    scopes: ["profile:read", "profile:candidates", "progress:write"],
  });
  mocks.findProfile.mockResolvedValue({
    id: "profile-1",
    userId: "user-1",
    updatedAt: new Date("2026-07-12T00:00:00.000Z"),
  });
  mocks.createCandidate.mockResolvedValue({ id: "candidate-1", status: "pending", requiresConfirmation: true });
  mocks.createProgress.mockResolvedValue({ id: "progress-1" });
});

describe("legacy MCP REST routes", () => {
  it("rejects reading a user different from the server-bound principal", async () => {
    const response = await readProfile(request({ userId: "user-2" }));

    expect(response.status).toBe(403);
    expect(mocks.findProfile).not.toHaveBeenCalled();
  });

  it("rejects creating a candidate for a different user", async () => {
    const response = await createCandidate(request({
      userId: "user-2",
      source: "chat",
      field: "major",
      newValue: "统计学",
      confidence: 0.9,
      reason: "用户明确说明",
    }));

    expect(response.status).toBe(403);
    expect(mocks.createCandidate).not.toHaveBeenCalled();
  });

  it("rejects writing progress for a different user", async () => {
    const response = await updateProgress(request({
      userId: "user-2",
      eventType: "task_updated",
      title: "完成任务",
    }));

    expect(response.status).toBe(403);
    expect(mocks.createProgress).not.toHaveBeenCalled();
  });

  it("rejects a principal without the route scope", async () => {
    mocks.getPluginPrincipal.mockReturnValue({ userId: "user-1", scopes: [] });

    const response = await readProfile(request({ userId: "user-1" }));

    expect(response.status).toBe(403);
    expect(mocks.findProfile).not.toHaveBeenCalled();
  });
});
