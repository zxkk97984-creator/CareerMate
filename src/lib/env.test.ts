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

  it("defaults history mode to provider", async () => {
    vi.stubEnv("TBOX_HISTORY_MODE", "");
    const { getTboxConfig } = await import("./env");
    const config = getTboxConfig();
    expect(config.historyMode).toBe("provider");
  });

  it("reads history mode context_only", async () => {
    vi.stubEnv("TBOX_HISTORY_MODE", "context_only");
    const { getTboxConfig } = await import("./env");
    const config = getTboxConfig();
    expect(config.historyMode).toBe("context_only");
  });

  it("defaults context transport to business_data", async () => {
    vi.stubEnv("TBOX_CONTEXT_TRANSPORT", "");
    const { getTboxConfig } = await import("./env");
    const config = getTboxConfig();
    expect(config.contextTransport).toBe("business_data");
  });

  it("reads context transport question_prefix", async () => {
    vi.stubEnv("TBOX_CONTEXT_TRANSPORT", "question_prefix");
    const { getTboxConfig } = await import("./env");
    const config = getTboxConfig();
    expect(config.contextTransport).toBe("question_prefix");
  });

  it("defaults structured mode to terminal", async () => {
    vi.stubEnv("TBOX_STRUCTURED_MODE", "");
    const { getTboxConfig } = await import("./env");
    const config = getTboxConfig();
    expect(config.structuredMode).toBe("terminal");
  });

  it("reads structured mode followup", async () => {
    vi.stubEnv("TBOX_STRUCTURED_MODE", "followup");
    const { getTboxConfig } = await import("./env");
    const config = getTboxConfig();
    expect(config.structuredMode).toBe("followup");
  });

  it("rejects invalid structured mode values and defaults to terminal", async () => {
    vi.stubEnv("TBOX_STRUCTURED_MODE", "garbage");
    const { getTboxConfig } = await import("./env");
    const config = getTboxConfig();
    expect(config.structuredMode).toBe("terminal");
  });
});
