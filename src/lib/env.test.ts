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

  it("defaults history mode to context_only", async () => {
    vi.stubEnv("TBOX_HISTORY_MODE", "");
    const { getTboxConfig } = await import("./env");
    const config = getTboxConfig();
    expect(config.historyMode).toBe("context_only");
  });

  it("reads history mode context_only", async () => {
    vi.stubEnv("TBOX_HISTORY_MODE", "context_only");
    const { getTboxConfig } = await import("./env");
    const config = getTboxConfig();
    expect(config.historyMode).toBe("context_only");
  });

  it("defaults context transport to question_prefix（2026-07-15 探针结果）", async () => {
    vi.stubEnv("TBOX_CONTEXT_TRANSPORT", "");
    const { getTboxConfig } = await import("./env");
    const config = getTboxConfig();
    expect(config.contextTransport).toBe("question_prefix");
  });

  it("reads context transport question_prefix", async () => {
    vi.stubEnv("TBOX_CONTEXT_TRANSPORT", "question_prefix");
    const { getTboxConfig } = await import("./env");
    const config = getTboxConfig();
    expect(config.contextTransport).toBe("question_prefix");
  });

  it("defaults structured mode to disabled", async () => {
    vi.stubEnv("TBOX_STRUCTURED_MODE", "");
    const { getTboxConfig } = await import("./env");
    const config = getTboxConfig();
    expect(config.structuredMode).toBe("disabled");
  });

  it("reads structured mode followup", async () => {
    vi.stubEnv("TBOX_STRUCTURED_MODE", "followup");
    const { getTboxConfig } = await import("./env");
    const config = getTboxConfig();
    expect(config.structuredMode).toBe("followup");
  });

  it("rejects invalid structured mode values and defaults to disabled", async () => {
    vi.stubEnv("TBOX_STRUCTURED_MODE", "garbage");
    const { getTboxConfig } = await import("./env");
    const config = getTboxConfig();
    expect(config.structuredMode).toBe("disabled");
  });

  it("defaults reuseRemoteConversationId to false", async () => {
    vi.stubEnv("TBOX_REUSE_REMOTE_CONVERSATION_ID", "");
    const { getTboxConfig } = await import("./env");
    const config = getTboxConfig();
    expect(config.reuseRemoteConversationId).toBe(false);
  });

  it("reads reuseRemoteConversationId true correctly", async () => {
    vi.stubEnv("TBOX_REUSE_REMOTE_CONVERSATION_ID", "true");
    const { getTboxConfig } = await import("./env");
    const config = getTboxConfig();
    expect(config.reuseRemoteConversationId).toBe(true);
  });

  it("defaults probeAgentId to undefined when unset", async () => {
    vi.stubEnv("TBOX_PROBE_AGENT_ID", "");
    const { getTboxConfig } = await import("./env");
    const config = getTboxConfig();
    expect(config.probeAgentId).toBeUndefined();
  });

  it("reads probeAgentId when set", async () => {
    vi.stubEnv("TBOX_PROBE_AGENT_ID", "probe-agent-v1");
    const { getTboxConfig } = await import("./env");
    const config = getTboxConfig();
    expect(config.probeAgentId).toBe("probe-agent-v1");
  });
});

describe("feature flags", () => {
  it("STATEFUL_CHAT_TURNS defaults to true", async () => {
    vi.stubEnv("STATEFUL_CHAT_TURNS", "");
    const { isStatefulChatTurns } = await import("./env");
    expect(isStatefulChatTurns()).toBe(true);
  });

  it("STATEFUL_CHAT_TURNS can be disabled", async () => {
    vi.stubEnv("STATEFUL_CHAT_TURNS", "false");
    const { isStatefulChatTurns } = await import("./env");
    expect(isStatefulChatTurns()).toBe(false);
  });

  it("OPEN_CHAT_ENTRY defaults to true", async () => {
    vi.stubEnv("OPEN_CHAT_ENTRY", "");
    const { isOpenChatEntry } = await import("./env");
    expect(isOpenChatEntry()).toBe(true);
  });

  it("OPEN_CHAT_ENTRY can be disabled", async () => {
    vi.stubEnv("OPEN_CHAT_ENTRY", "false");
    const { isOpenChatEntry } = await import("./env");
    expect(isOpenChatEntry()).toBe(false);
  });
});
