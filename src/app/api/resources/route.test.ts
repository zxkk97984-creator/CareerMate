import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), requireCurrentUser: vi.fn() }));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ resourceItem: { findMany: mocks.findMany } }) }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
  mocks.findMany.mockResolvedValue([]);
});

describe("GET /api/resources", () => {
  it("requires authentication", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("unauthorized"));

    const response = await GET(new Request("http://localhost/api/resources"));

    expect(response.status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it.each([
    "roleKey=unknown",
    "abilityKey=unknown",
    "type=video",
    `roleKey=${"x".repeat(101)}`,
  ])("rejects invalid filter query %s", async (query) => {
    const response = await GET(new Request(`http://localhost/api/resources?${query}`));

    expect(response.status).toBe(400);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("applies role, ability, and type filters together", async () => {
    await GET(new Request("http://localhost/api/resources?roleKey=data_analyst&abilityKey=dataAnalysis&type=course"));

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { roleKey: "data_analyst", abilityKey: "dataAnalysis", type: "course" },
      orderBy: [{ roleKey: "asc" }, { stage: "asc" }],
    });
  });

  it("returns only resources allowed by the source policy and keeps source visible", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "allowed", source: "官方文档", title: "Docs" },
      { id: "denied", source: "网页爬取", title: "Scrape" },
      { id: "empty", source: "", title: "Unknown" },
    ]);

    const payload = await (await GET(new Request("http://localhost/api/resources"))).json();

    expect(payload.data.items).toEqual([{ id: "allowed", source: "官方文档", title: "Docs" }]);
  });
});
