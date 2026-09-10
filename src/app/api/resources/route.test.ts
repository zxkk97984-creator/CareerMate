import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  requireCurrentUser: vi.fn(),
  careerPlanFindUnique: vi.fn(),
  careerPlanFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    resourceItem: { findMany: mocks.findMany },
    careerPlan: { findUnique: mocks.careerPlanFindUnique, findMany: mocks.careerPlanFindMany },
  }),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
  mocks.findMany.mockResolvedValue([]);
  mocks.careerPlanFindUnique.mockReset();
  mocks.careerPlanFindMany.mockReset();
});

describe("GET /api/resources", () => {
  it("requires authentication", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("unauthorized"));

    const response = await GET(new Request("http://localhost/api/resources"));

    expect(response.status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it.each([
    "abilityKey=unknown",
    "type=video",
    `roleKey=${"x".repeat(200)}`,
  ])("rejects invalid filter query %s", async (query) => {
    const response = await GET(new Request(`http://localhost/api/resources?${query}`));

    expect(response.status).toBe(400);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("applies role, ability, and type filters together", async () => {
    await GET(new Request("http://localhost/api/resources?roleKey=data_analyst&abilityKey=dataAnalysis&type=course"));

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        roleKey: "data_analyst",
        abilityKey: "dataAnalysis",
        type: "course",
        status: "active",
        verificationStatus: "verified",
      },
      orderBy: [{ roleKey: "asc" }, { stage: "asc" }, { title: "asc" }],
    });
  });

  it("returns only resources allowed by the source policy and keeps source visible", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "allowed", source: "官方文档", title: "Docs" },
      { id: "denied", source: "网页爬取", title: "Scrape" },
      { id: "empty", source: "", title: "Unknown" },
    ]);

    const payload = await (await GET(new Request("http://localhost/api/resources"))).json();

    expect(payload.data.items).toHaveLength(1);
    expect(payload.data.items[0]).toMatchObject({ id: "allowed", source: "官方文档", title: "Docs" });
  });

  it("verified task context returns the owning plan's roleKey and task title", async () => {
    mocks.careerPlanFindUnique.mockResolvedValue({
      id: "plan-1",
      userId: "user-1",
      targetRole: "data_analyst",
      schemaVersion: 1,
      content: "{}",
      years: "[]",
      quarters: "[]",
      months: JSON.stringify([{ monthIndex: 1, goal: "基础", learningTasks: [{ id: "task-9", title: "完成实训对比" }], practiceOutputs: [], evaluationMetrics: [] }]),
      currentMonthIndex: 1,
      assumptions: "[]",
      riskNotes: "[]",
    });

    const payload = await (await GET(new Request("http://localhost/api/resources?taskId=task-9&planId=plan-1"))).json();

    expect(payload.data.context).toEqual({ taskId: "task-9", planId: "plan-1", taskTitle: "完成实训对比", roleKey: "data_analyst" });
    // 上下文角色作为默认筛选角色
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ roleKey: "data_analyst", status: "active", verificationStatus: "verified" }),
    }));
  });

  it("explicit roleKey overrides the context default role", async () => {
    mocks.careerPlanFindUnique.mockResolvedValue({
      id: "plan-1",
      userId: "user-1",
      targetRole: "data_analyst",
      schemaVersion: 1,
      content: "{}",
      years: "[]",
      quarters: "[]",
      months: JSON.stringify([{ monthIndex: 1, goal: "基础", learningTasks: [{ id: "task-9", title: "完成实训对比" }], practiceOutputs: [], evaluationMetrics: [] }]),
      currentMonthIndex: 1,
      assumptions: "[]",
      riskNotes: "[]",
    });

    await GET(new Request("http://localhost/api/resources?taskId=task-9&planId=plan-1&roleKey=aigc_operator"));

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ roleKey: "aigc_operator" }),
    }));
  });

  it("rejects task context not owned by the current user", async () => {
    mocks.careerPlanFindUnique.mockResolvedValue({ id: "plan-1", userId: "user-2", targetRole: "data_analyst", content: "{}" });

    const response = await GET(new Request("http://localhost/api/resources?taskId=task-9&planId=plan-1"));

    expect(response.status).toBe(404);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("taskId without planId is resolved across the user's plans", async () => {
    mocks.careerPlanFindMany.mockResolvedValue([
      { id: "plan-a", targetRole: "data_analyst", content: "{}", userId: "user-1", schemaVersion: 1, years: "[]", quarters: "[]", months: "[]", currentMonthIndex: 1, assumptions: "[]", riskNotes: "[]" },
      { id: "plan-b", targetRole: "aigc_operator", content: JSON.stringify({ months: [{ learningTasks: [{ id: "task-5", title: "搭建工作流" }] }] }), userId: "user-1", schemaVersion: 1, years: "[]", quarters: "[]", months: "[]", currentMonthIndex: 1, assumptions: "[]", riskNotes: "[]" },
    ]);

    const payload = await (await GET(new Request("http://localhost/api/resources?taskId=task-5"))).json();

    expect(payload.data.context).toEqual({ taskId: "task-5", planId: "plan-b", taskTitle: "搭建工作流", roleKey: "aigc_operator" });
  });
});
