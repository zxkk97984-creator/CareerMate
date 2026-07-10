import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRoleDraftContent } from "@/lib/admin-role-draft";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ roleDraft: { findUnique: mocks.findUnique, update: mocks.update }, roleTemplate: { upsert: mocks.upsert } }) }));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks(); mocks.requireAdmin.mockResolvedValue({ id: "admin-1" });
  mocks.findUnique.mockResolvedValue({ id: "draft-1", roleKey: "custom_ai", roleName: "AI 客户成功", category: "客户服务", status: "approved", content: JSON.stringify(buildRoleDraftContent("AI 客户成功", ["管理员访谈"])) });
  mocks.upsert.mockResolvedValue({ id: "template-1", roleKey: "custom_ai" });
});

describe("POST /api/admin/role-drafts/:id/approve", () => {
  it("keeps repeated approval idempotent", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: "draft-1" }) });
    const payload = await response.json();
    expect(payload.data.alreadyApproved).toBe(true);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
