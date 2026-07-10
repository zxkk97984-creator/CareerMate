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
});
