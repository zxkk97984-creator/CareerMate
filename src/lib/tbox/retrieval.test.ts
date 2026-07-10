import { describe, expect, it, vi } from "vitest";
import { datasetKeySchema, resolveDatasetId, retrieveWithTbox } from "./retrieval";
import type { TboxConfig } from "./types";

const config: TboxConfig = {
  mode: "api",
  apiKey: "test-api-key",
  agentId: "agent-1",
  chatEndpoint: "https://tbox.example/chat/create",
  retrieveEndpoint: "https://tbox.example/retrieve",
  streamTimeoutMs: 90_000,
  datasetIds: {
    roleCompetency: "dataset-role",
    learningResources: "dataset-learning",
    simulationScenes: "dataset-simulation",
    ethicsRules: "dataset-ethics",
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

  it("posts the mapped ID and normalizes source and score", async () => {
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => {
      void _url;
      void _init;
      return new Response(
        JSON.stringify({
          data: {
            results: [{ text: "SQL 基础", source: "knowledge-base", relevance_score: 0.91 }],
          },
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
      data: { items: [{ content: "SQL 基础", source: "knowledge-base", score: 0.91 }] },
      meta: {
        requestedMode: "api",
        actualMode: "api",
        degraded: false,
        fallbackReason: null,
        source: "tbox-api",
      },
    });
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
});
