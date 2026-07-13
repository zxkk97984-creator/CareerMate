import { describe, expect, it, vi } from "vitest";
import {
  datasetKeySchema,
  resolveDatasetId,
  retrievalInputSchema,
  retrieveWithTbox,
} from "./retrieval";
import type { TboxConfig } from "./types";

const config: TboxConfig = {
  mode: "api",
  apiKey: "test-api-key",
  agentId: "agent-1",
  searchEngine: false,
  retrievalMode: "agent",
  chatEndpoint: "https://tbox.example/chat/create",
  retrieveEndpoint: "https://tbox.example/retrieve",
  streamTimeoutMs: 90_000,
  datasetIds: {
    roleCompetency: "dataset-role",
    learningResources: "dataset-learning",
    simulationScenes: "dataset-simulation",
    ethicsRules: "dataset-ethics",
    careerTrends: "",
  },
};

describe("retrieval dataset mapping", () => {
  it("allows only approved dataset keys", () => {
    expect(datasetKeySchema.safeParse("roleCompetency").success).toBe(true);
    expect(datasetKeySchema.safeParse("privateDatasetId").success).toBe(false);
  });

  it.each([
    ["roleCompetency", "dataset-role"],
    ["learningResources", "dataset-learning"],
    ["simulationScenes", "dataset-simulation"],
    ["ethicsRules", "dataset-ethics"],
  ] as const)("maps %s to its configured ID", (key, expected) => {
    expect(resolveDatasetId(config, key)).toBe(expected);
  });

  it("posts the mapped ID and normalizes the official retrieval response", async () => {
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => {
      void _url;
      void _init;
      return new Response(
        JSON.stringify({
          success: true,
          errorCode: "0",
          errorMsg: "",
          traceId: "trace-1",
          data: [{ content: "SQL 基础", originFileName: "sql-guide.md", score: 0.91 }],
        }),
        { status: 200 },
      );
    });

    const result = await retrieveWithTbox(
      { datasetKey: "learningResources", query: "SQL", limit: 3 },
      { config, fetchImpl, local: async () => [] },
    );

    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({
      dataset_id: "dataset-learning",
      query: "SQL",
      limit: 3,
    });
    expect(result).toEqual({
      data: { items: [{ content: "SQL 基础", source: "sql-guide.md", score: 0.91 }] },
      meta: {
        requestedMode: "api",
        actualMode: "api",
        degraded: false,
        fallbackReason: null,
        source: "tbox-api",
      },
    });
  });

  it.each([
    [{ success: false, errorCode: "0", errorMsg: "provider rejected", data: [] }],
    [{ success: true, errorCode: "DATASET_ERROR", errorMsg: "provider rejected", data: [] }],
  ])("falls back when the official response reports provider failure", async (payload) => {
    const result = await retrieveWithTbox(
      { datasetKey: "learningResources", query: "SQL", limit: 3 },
      {
        config,
        fetchImpl: vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
        local: async () => [{ content: "local SQL", source: "local-resource-item", score: 1 }],
      },
    );

    expect(result).toEqual({
      data: { items: [{ content: "local SQL", source: "local-resource-item", score: 1 }] },
      meta: {
        requestedMode: "api",
        actualMode: "manual",
        degraded: true,
        fallbackReason: "provider_error",
        source: "local-knowledge-base",
      },
    });
    expect(JSON.stringify(result)).not.toContain("provider rejected");
  });

  it("falls back to mock when the manual retrieval provider is unavailable", async () => {
    const result = await retrieveWithTbox(
      { datasetKey: "learningResources", query: "SQL", limit: 3 },
      {
        config: { ...config, mode: "manual" },
        fetchImpl: vi.fn(),
        local: async () => {
          throw new Error("database unavailable");
        },
      },
    );

    expect(result.meta).toMatchObject({
      requestedMode: "manual",
      actualMode: "mock",
      degraded: true,
      fallbackReason: "manual_unavailable",
      source: "local-mock",
    });
    expect(result.data.items.length).toBeGreaterThan(0);
  });

  it("rejects limits above the official maximum of 10", () => {
    expect(
      retrievalInputSchema.safeParse({
        datasetKey: "learningResources",
        query: "SQL",
        limit: 11,
      }).success,
    ).toBe(false);
  });
});
