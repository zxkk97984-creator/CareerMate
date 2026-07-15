import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
  configMode: "api" as "api" | "manual" | "mock",
  conversationCreate: vi.fn(),
  conversationFindUnique: vi.fn(),
  conversationUpdateMany: vi.fn(),
  requireCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/env", () => ({
  getTboxConfig: () => ({
    mode: mocks.configMode,
    apiKey: "",
    appId: "app",
    agentId: "agent",
    agentVersion: undefined,
    searchEngine: false,
    retrievalMode: "agent" as const,
    historyMode: "provider",
    contextTransport: "business_data",
    structuredMode: "terminal",
    reuseRemoteConversationId: false,
    chatEndpoint: "https://example.test/chat",
    retrieveEndpoint: "https://example.test/retrieve",
    streamTimeoutMs: 100,
    webServiceUrl: "",
    probeAgentId: undefined,
    datasetIds: {
      roleCompetency: "",
      learningResources: "",
      simulationScenes: "",
      ethicsRules: "",
      careerTrends: "",
    },
  }),
}));
vi.mock("@/lib/tbox/adapter", () => ({ chatWithTbox: mocks.chat }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    onboardingConversation: {
      create: mocks.conversationCreate,
      findUnique: mocks.conversationFindUnique,
      updateMany: mocks.conversationUpdateMany,
    },
  }),
}));

import { POST } from "./route";

const degradedMeta = {
  requestedMode: "api",
  actualMode: "mock",
  degraded: true,
  fallbackReason: "network_error",
  source: "local-mock",
};

function request(body: unknown) {
  return new Request("http://localhost/api/onboarding/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configMode = "api";
  mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
  mocks.conversationCreate.mockResolvedValue({
    id: "conversation-1",
    userId: "user-1",
    status: "active",
    transcript: "[]",
    draft: "{}",
    completeness: 0,
    updatedAt: new Date("2026-07-10T00:00:00.000Z"),
  });
  mocks.chat.mockResolvedValue({
    data: { conversationId: null, text: "generic mock answer" },
    meta: degradedMeta,
  });
  mocks.conversationUpdateMany.mockResolvedValue({ count: 1 });
});

describe("POST /api/onboarding/chat", () => {
  it("requires authentication and validates input", async () => {
    mocks.requireCurrentUser.mockRejectedValueOnce(new Error("UNAUTHORIZED"));
    expect((await POST(request({ message: "hello" }))).status).toBe(401);

    mocks.requireCurrentUser.mockResolvedValueOnce({ id: "user-1" });
    expect((await POST(request({ message: "" }))).status).toBe(400);
  });

  it.each([
    [null, 404],
    [{ id: "foreign", userId: "user-2", status: "active", transcript: "[]", draft: "{}" }, 404],
    [{ id: "completed", userId: "user-1", status: "completed", transcript: "[]", draft: "{}" }, 409],
  ])("rejects missing, foreign, or inactive conversations", async (stored, status) => {
    mocks.conversationFindUnique.mockResolvedValue(stored);

    const response = await POST(request({ message: "每周 8 小时", conversationId: "conversation-x" }));

    expect(response.status).toBe(status);
    expect(mocks.chat).not.toHaveBeenCalled();
    expect(mocks.conversationUpdateMany).not.toHaveBeenCalled();
  });

  it("creates a conversation, persists both transcript turns and returns deterministic fallback with meta", async () => {
    const response = await POST(request({
      message: "我是大三统计学专业，想做数据分析师，每周投入 8 小时，喜欢项目实操。",
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      data: {
        conversationId: "conversation-1",
        assistantMessage: expect.stringContaining("过去做过"),
        draft: {
          educationStage: "junior",
          major: "统计学",
          targetRole: "data_analyst",
          targetRoleLabel: "数据分析师",
          weeklyAvailableHours: 8,
          learningPreference: ["project", "practice"],
        },
        profileCompleteness: 5 / 7,
        profileUpdateCandidate: expect.objectContaining({ field: "educationStage" }),
      },
      meta: degradedMeta,
    });
    expect(mocks.conversationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1", status: "active", requestedMode: "api", actualMode: "api" }),
    });
    const updated = mocks.conversationUpdateMany.mock.calls[0][0];
    expect(updated.where).toEqual({
      id: "conversation-1",
      userId: "user-1",
      status: "active",
      updatedAt: new Date("2026-07-10T00:00:00.000Z"),
    });
    expect(JSON.parse(updated.data.transcript)).toEqual([
      { role: "user", content: "我是大三统计学专业，想做数据分析师，每周投入 8 小时，喜欢项目实操。" },
      {
        role: "assistant",
        content: expect.stringContaining("过去做过"),
        meta: degradedMeta,
      },
    ]);
    expect(JSON.parse(updated.data.draft)).toEqual(payload.data.draft);
    expect(updated.data).toMatchObject({ completeness: 5 / 7, requestedMode: "api", actualMode: "mock" });
  });

  it("preserves stored facts and uses the API answer only when actual mode is api", async () => {
    mocks.conversationFindUnique.mockResolvedValue({
      id: "conversation-1",
      userId: "user-1",
      status: "active",
      transcript: JSON.stringify([{ role: "assistant", content: "你的目标岗位是什么？" }]),
      draft: JSON.stringify({ educationStage: "junior", major: "统计学" }),
      updatedAt: new Date("2026-07-10T00:00:00.000Z"),
    });
    mocks.chat.mockResolvedValue({
      data: { conversationId: "remote-1", text: "很好。接下来请告诉我每周可投入的小时数。" },
      meta: { requestedMode: "api", actualMode: "api", degraded: false, fallbackReason: null, source: "tbox-api" },
    });

    const response = await POST(request({ message: "目标是 AI 产品经理", conversationId: "conversation-1" }));
    const payload = await response.json();

    expect(payload.data.assistantMessage).toContain("每周可投入");
    expect(payload.data.draft).toMatchObject({
      educationStage: "junior",
      major: "统计学",
      targetRole: "ai_product_manager",
    });
    const adapterInput = mocks.chat.mock.calls[0][0];
    expect(adapterInput).not.toHaveProperty("conversationId");
    expect(adapterInput.question).toContain("当前画像草稿");
    expect(adapterInput.question).toContain("weeklyAvailableHours");
    expect(adapterInput.question).not.toContain("https://example.test/chat");
  });

  it("self-heals a bare major answer from the stored transcript", async () => {
    mocks.conversationFindUnique.mockResolvedValue({
      id: "conversation-1",
      userId: "user-1",
      status: "active",
      transcript: JSON.stringify([
        { role: "user", content: "我是本科大二的学生" },
        { role: "assistant", content: "你目前主修的是什么专业呢？" },
        { role: "user", content: "数据科学与大数据技术" },
        { role: "assistant", content: "你目前有比较明确的目标岗位吗？" },
      ]),
      draft: JSON.stringify({ educationStage: "sophomore" }),
      updatedAt: new Date("2026-07-10T00:00:00.000Z"),
    });
    mocks.chat.mockResolvedValue({
      data: {
        conversationId: "remote-1",
        text: "接下来请告诉我每周可投入多少小时。",
      },
      meta: {
        requestedMode: "api",
        actualMode: "api",
        degraded: false,
        fallbackReason: null,
        source: "tbox-api",
      },
    });

    const response = await POST(
      request({ message: "AI产品经理", conversationId: "conversation-1" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.draft).toMatchObject({
      educationStage: "sophomore",
      major: "数据科学与大数据技术",
      targetRole: "ai_product_manager",
      targetRoleLabel: "AI 产品经理",
    });
    expect(mocks.chat.mock.calls[0][0].context.draft.major).toBe(
      "数据科学与大数据技术",
    );
    expect(payload.data.assistantMessage).not.toContain("专业");
  });

  it.each([
    ["null", []],
    ["{}", []],
    [
      JSON.stringify([
        null,
        {},
        { role: "system", content: "drop" },
        { role: "user", content: 42 },
        { role: "user", content: "保留已有消息", unexpected: "drop" },
        { role: "assistant", content: "保留已有回答", meta: degradedMeta },
      ]),
      [
        { role: "user", content: "保留已有消息" },
        { role: "assistant", content: "保留已有回答", meta: degradedMeta },
      ],
    ],
  ])("safely appends to stored transcript %s", async (transcript, expectedPrefix) => {
    mocks.conversationFindUnique.mockResolvedValue({
      id: "conversation-1",
      userId: "user-1",
      status: "active",
      transcript,
      draft: "{}",
      updatedAt: new Date("2026-07-10T00:00:00.000Z"),
    });

    const response = await POST(request({ message: "我是大三", conversationId: "conversation-1" }));
    const updatedTranscript = JSON.parse(mocks.conversationUpdateMany.mock.calls[0][0].data.transcript);

    expect(response.status).toBe(200);
    expect(updatedTranscript.slice(0, expectedPrefix.length)).toEqual(expectedPrefix);
    expect(updatedTranscript.slice(-2)).toEqual([
      { role: "user", content: "我是大三" },
      { role: "assistant", content: expect.any(String), meta: degradedMeta },
    ]);
  });

  it.each(["mock", "manual"] as const)(
    "invokes the unified adapter in requested %s mode and persists its honest metadata",
    async (mode) => {
      mocks.configMode = mode;
      const meta = {
        requestedMode: mode,
        actualMode: mode,
        degraded: false,
        fallbackReason: null,
        source: mode === "mock" ? "local-mock" : "manual-fixture",
      };
      mocks.chat.mockResolvedValue({
        data: { conversationId: null, text: `${mode} generic answer` },
        meta,
      });

      const response = await POST(request({ message: "我是大三" }));
      const payload = await response.json();

      expect(mocks.chat).toHaveBeenCalledTimes(1);
      expect(payload.meta).toEqual(meta);
      expect(payload.data.assistantMessage).toContain("专业或主要背景");
      expect(mocks.conversationUpdateMany).toHaveBeenCalledWith({
        where: {
          id: "conversation-1",
          userId: "user-1",
          status: "active",
          updatedAt: new Date("2026-07-10T00:00:00.000Z"),
        },
        data: expect.objectContaining({ requestedMode: mode, actualMode: mode }),
      });
    },
  );

  it("rejects a stale concurrent write without overwriting the newer conversation", async () => {
    mocks.conversationFindUnique.mockResolvedValue({
      id: "conversation-1",
      userId: "user-1",
      status: "active",
      transcript: "[]",
      draft: "{}",
      updatedAt: new Date("2026-07-10T00:00:00.000Z"),
    });
    mocks.conversationUpdateMany.mockResolvedValueOnce({ count: 0 });

    const response = await POST(request({ message: "我是大三", conversationId: "conversation-1" }));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      ok: false,
      error: { code: "CONVERSATION_CHANGED" },
    });
    expect(mocks.conversationUpdateMany).toHaveBeenCalledTimes(1);
  });
});
