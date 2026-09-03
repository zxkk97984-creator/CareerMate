import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/env", () => ({ getTboxConfig: () => ({ mode: "api" }) }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ roleDraft: { create: mocks.create } }) }));

import { POST } from "./route";

beforeEach(() => { vi.clearAllMocks(); mocks.requireAdmin.mockResolvedValue({ id: "admin-1" }); mocks.create.mockImplementation(({ data }) => ({ id: "draft-1", ...data })); });

describe("POST /api/admin/role-drafts/generate", () => {
  it("returns 403 to ordinary users", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("forbidden"));
    const response = await POST(new Request("http://localhost/api/admin/role-drafts/generate", { method: "POST", body: "{}" }));
    expect(response.status).toBe(403); expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates a validated traceable draft and discloses manual fallback", async () => {
    const response = await POST(new Request("http://localhost/api/admin/role-drafts/generate", { method: "POST", body: JSON.stringify({ roleName: "AI 客户成功", category: "客户服务", sourceNotes: "管理员访谈" }) }));
    const payload = await response.json();
    expect(payload.data.validation.valid).toBe(true);
    expect(payload.data.content.sources).toEqual(["管理员访谈"]);
    expect(payload.meta).toMatchObject({ requestedMode: "api", actualMode: "manual", degraded: true });
  });
});
