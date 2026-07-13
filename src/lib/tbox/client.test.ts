import { describe, expect, it, vi } from "vitest";
import { consumeChatResponse } from "./client";

describe("tbox client request contract", () => {
  it("sends conversation and agent options in the JSON body", async () => {
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) =>
      new Response("{}", { status: 200 }),
    );
    await consumeChatResponse(
      { question: "hello", userId: "user-1", conversationId: "remote-1" },
      true,
      {
        config: {
          mode: "api",
          apiKey: "secret",
          agentId: "agent-1",
          agentVersion: "2.0",
          searchEngine: false,
          retrievalMode: "agent",
          chatEndpoint: "https://o.tbox.cn/openapi/v1/chat/create",
          retrieveEndpoint: "https://api.tbox.cn/api/datasets/retrieve",
          streamTimeoutMs: 90_000,
          datasetIds: {
            roleCompetency: "",
            learningResources: "",
            simulationScenes: "",
            ethicsRules: "",
            careerTrends: "",
          },
        } as import("./types").TboxConfig,
        fetchImpl: fetchImpl as typeof fetch,
      },
      async () => undefined,
    );
    const [url, init] = fetchImpl.mock.calls[0]!;
    // conversation_id 不应出现在 URL 查询参数中
    expect(String(url)).not.toContain("conversation_id");
    // 请求体应包含新字段
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      agent_id: "agent-1",
      agent_version: "2.0",
      conversation_id: "remote-1",
      search_engine: false,
      stream: true,
    });
  });
});
