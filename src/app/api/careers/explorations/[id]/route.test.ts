import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({ careerExplorationReport: { findFirst: mocks.findFirst } }),
}));

const { GET } = await import("./route");

describe("GET /api/careers/explorations/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("返回当前用户的结构化报告并标注来源类型", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
    mocks.findFirst.mockResolvedValue({
      id: "report-1",
      userId: "user-1",
      roleName: "用户研究员",
      status: "exploratory",
      content: JSON.stringify({
        roleName: "用户研究员",
        summary: "报告摘要",
        responsibilities: [],
        coreCompetencies: [],
        entryPaths: [],
        marketSignals: [],
        learningSuggestions: [],
        fitAnalysis: ["AI推断：需继续验证"],
        risksAndUncertainties: [],
        sources: [{
          title: "官方介绍",
          organization: "示例机构",
          url: "https://example.com/role",
          accessedAt: "2026-07-12",
          label: "实时联网调研",
        }],
      }),
      executionMeta: "{}",
    });

    const response = await GET(
      new Request("http://localhost/api/careers/explorations/report-1"),
      { params: Promise.resolve({ id: "report-1" }) },
    );
    const body = await response.json();

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "report-1", userId: "user-1" },
    });
    expect(body.data.sourceLabel).toBe("实时联网调研");
    expect(body.data.report.roleName).toBe("用户研究员");
  });
});
