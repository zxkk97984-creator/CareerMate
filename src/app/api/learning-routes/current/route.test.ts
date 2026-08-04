import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const mocks = {
    learningRoute: {
      findFirst: vi.fn(),
    },
    careerPlan: {
      findFirst: vi.fn(),
    },
  };
  return {
    getPrisma: () => mocks,
  };
});

import { GET } from "./route";
import { requireCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

describe("GET /api/learning-routes/current", () => {
  it("未登录返回 401", async () => {
    vi.mocked(requireCurrentUser).mockRejectedValue(new Error("unauthorized"));
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toBeDefined();
  });

  it("无学习路线返回 route:null", async () => {
    vi.mocked(requireCurrentUser).mockResolvedValue({ id: "u1", profile: {} } as never);
    (getPrisma() as any).learningRoute.findFirst.mockResolvedValue(null);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.route).toBeNull();
  });

  it("有 active 路线返回完整数据", async () => {
    vi.mocked(requireCurrentUser).mockResolvedValue({ id: "u1", profile: {} } as never);
    (getPrisma() as any).learningRoute.findFirst.mockResolvedValue({
      id: "lr-1",
      version: 2,
      status: "active",
      schemaVersion: 1,
      content: JSON.stringify({ targetRole: "ai_product_manager", stages: [{ title: "阶段1" }] }),
      basePlanVersion: 3,
      relatedPlanId: "plan-1",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
    });
    (getPrisma() as any).careerPlan.findFirst.mockResolvedValue({
      id: "plan-1",
      targetRole: "ai_product_manager",
      targetRoleLabel: "AI 产品经理",
      version: 3,
      status: "active",
    });

    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.route).toBeDefined();
    expect(body.data.route.id).toBe("lr-1");
    expect(body.data.route.version).toBe(2);
    expect(body.data.route.content.stages).toHaveLength(1);
    expect(body.data.route.relatedPlan.id).toBe("plan-1");
    expect(body.data.route.relatedPlan.targetRole).toBe("ai_product_manager");
    expect((getPrisma() as any).careerPlan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "plan-1", userId: "u1" }),
      }),
    );
  });

  it("不返回其他用户的学习路线（userId 隔离）", async () => {
    vi.mocked(requireCurrentUser).mockResolvedValue({ id: "u1", profile: {} } as never);
    // 只查询当前 userId 的路线
    (getPrisma() as any).learningRoute.findFirst.mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();
    expect(body.data.route).toBeNull();
    // 验证查询条件包含 userId
    expect((getPrisma() as any).learningRoute.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "u1" }),
      }),
    );
  });
});
