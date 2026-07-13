import { describe, expect, it, vi } from "vitest";

describe("tbox environment config", () => {
  it("reads optional main-agent options safely", async () => {
    vi.stubEnv("TBOX_AGENT_VERSION", "2.0");
    vi.stubEnv("TBOX_SEARCH_ENGINE", "false");
    vi.stubEnv("TBOX_RETRIEVAL_MODE", "agent");
    vi.stubEnv("TBOX_DATASET_CAREER_TRENDS", "dataset-trends");
    const { getTboxConfig } = await import("./env");
    const config = getTboxConfig();
    expect(config.agentVersion).toBe("2.0");
    expect(config.searchEngine).toBe(false);
    expect(config.retrievalMode).toBe("agent");
    expect(config.datasetIds.careerTrends).toBe("dataset-trends");
  });

  it("defaults search engine to false when unset", async () => {
    vi.stubEnv("TBOX_SEARCH_ENGINE", "");
    const { getTboxConfig } = await import("./env");
    const config = getTboxConfig();
    expect(config.searchEngine).toBe(false);
  });

  it("reads search_engine true correctly", async () => {
    vi.stubEnv("TBOX_SEARCH_ENGINE", "true");
    const { getTboxConfig } = await import("./env");
    const config = getTboxConfig();
    expect(config.searchEngine).toBe(true);
  });

  it("defaults retrieval mode to agent", async () => {
    vi.stubEnv("TBOX_RETRIEVAL_MODE", "");
    const { getTboxConfig } = await import("./env");
    const config = getTboxConfig();
    expect(config.retrievalMode).toBe("agent");
  });
});
