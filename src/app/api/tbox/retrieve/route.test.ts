import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  retrieve: vi.fn(),
  resourceFindMany: vi.fn(),
  roleFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/env", () => ({ getTboxConfig: () => ({ mode: "mock" }) }));
vi.mock("@/lib/tbox/retrieval", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tbox/retrieval")>();
  return { ...actual, retrieveWithTbox: mocks.retrieve };
});
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    resourceItem: { findMany: mocks.resourceFindMany },
    roleTemplate: { findMany: mocks.roleFindMany },
  }),
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
  mocks.retrieve.mockResolvedValue({
    data: { items: [{ content: "SQL", source: "local", score: 1 }] },
    meta: {
      requestedMode: "mock",
      actualMode: "mock",
      degraded: false,
      fallbackReason: null,
      source: "local-mock",
    },
  });
});

describe("POST /api/tbox/retrieve", () => {
  it("rejects non-approved dataset keys", async () => {
    const response = await POST(
      new Request("http://localhost/api/tbox/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetKey: "privateDataset", query: "SQL", limit: 3 }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it("returns normalized retrieval data and metadata", async () => {
    const response = await POST(
      new Request("http://localhost/api/tbox/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetKey: "learningResources", query: "SQL", limit: 3 }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.items[0]).toEqual({ content: "SQL", source: "local", score: 1 });
    expect(body.meta.actualMode).toBe("mock");
  });

  it("uses dedicated ethics guidance instead of role evaluation rules", async () => {
    mocks.roleFindMany.mockResolvedValue([
      {
        roleKey: "data_analyst",
        roleName: "数据分析师",
        evaluationRules: JSON.stringify(["岗位面试评分规则"]),
      },
    ]);
    await POST(
      new Request("http://localhost/api/tbox/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetKey: "ethicsRules", query: "隐私", limit: 3 }),
      }),
    );

    const local = mocks.retrieve.mock.calls[0][1].local as (input: {
      datasetKey: "ethicsRules";
      query: string;
      limit: number;
    }) => Promise<Array<{ content: string; source: string; score: number }>>;
    const items = await local({ datasetKey: "ethicsRules", query: "隐私", limit: 3 });
    const content = items.map((item) => item.content).join("\n");

    expect(content).toMatch(/隐私|同意|授权/);
    expect(content).toContain("未经授权抓取");
    expect(content).not.toContain("岗位面试评分规则");
    expect(mocks.roleFindMany).not.toHaveBeenCalled();
  });

  it("filters local role knowledge by query before applying the limit", async () => {
    mocks.roleFindMany.mockResolvedValue([
      {
        roleKey: "ai_product_manager",
        roleName: "AI 产品经理",
        category: "产品",
        entryRequirements: JSON.stringify(["PRD"]),
        coreWork: JSON.stringify(["需求分析"]),
        simulationScenarios: JSON.stringify(["跨岗位沟通"]),
      },
      {
        roleKey: "data_analyst",
        roleName: "数据分析师",
        category: "数据",
        entryRequirements: JSON.stringify(["SQL"]),
        coreWork: JSON.stringify(["数据分析"]),
        simulationScenarios: JSON.stringify(["分析结论汇报"]),
      },
    ]);
    await POST(
      new Request("http://localhost/api/tbox/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetKey: "roleCompetency", query: "数据分析师", limit: 1 }),
      }),
    );

    const local = mocks.retrieve.mock.calls[0][1].local as (input: {
      datasetKey: "roleCompetency";
      query: string;
      limit: number;
    }) => Promise<Array<{ content: string; source: string; score: number }>>;
    const items = await local({ datasetKey: "roleCompetency", query: "数据分析师", limit: 1 });
    expect(items).toHaveLength(1);
    expect(items[0]?.source).toContain("data_analyst");

    const natural = await local({
      datasetKey: "roleCompetency",
      query: "数据分析师需要哪些核心能力",
      limit: 1,
    });
    expect(natural[0]?.source).toContain("data_analyst");
  });
});
