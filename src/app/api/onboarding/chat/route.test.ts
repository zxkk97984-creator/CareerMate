import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
  conversationCreate: vi.fn(),
  conversationFindUnique: vi.fn(),
  conversationUpdate: vi.fn(),
  requireCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/env", () => ({
  getTboxConfig: () => ({
    mode: "api",
    apiKey: "",
    appId: "app",
    agentId: "agent",
    chatEndpoint: "https://example.test/chat",
    retrieveEndpoint: "https://example.test/retrieve",
    streamTimeoutMs: 100,
    webServiceUrl: "",
    datasetIds: {},
  }),
}));
vi.mock("@/lib/tbox/adapter", () => ({ chatWithTbox: mocks.chat }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    onboardingConversation: {
      create: mocks.conversationCreate,
      findUnique: mocks.conversationFindUnique,
      update: mocks.conversationUpdate,
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
  mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
  mocks.conversationCreate.mockResolvedValue({
    id: "conversation-1",
    userId: "user-1",
    status: "active",
    transcript: "[]",
    draft: "{}",
    completeness: 0,
  });
  mocks.chat.mockResolvedValue({
    data: { conversationId: null, answer: "generic mock answer" },
    meta: degradedMeta,
  });
  mocks.conversationUpdate.mockImplementation(async ({ data }) => ({ id: "conversation-1", ...data }));
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
    expect(mocks.conversationUpdate).not.toHaveBeenCalled();
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
    const updated = mocks.conversationUpdate.mock.calls[0][0];
    expect(updated.where).toEqual({ id: "conversation-1" });
    expect(JSON.parse(updated.data.transcript)).toEqual([
      { role: "user", content: "我是大三统计学专业，想做数据分析师，每周投入 8 小时，喜欢项目实操。" },
      { role: "assistant", content: expect.stringContaining("过去做过") },
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
    });
    mocks.chat.mockResolvedValue({
      data: { conversationId: "remote-1", answer: "很好。接下来请告诉我每周可投入的小时数。" },
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
    expect(adapterInput.question).toContain("当前画像草稿");
    expect(adapterInput.question).toContain("weeklyAvailableHours");
    expect(adapterInput.question).not.toContain("https://example.test/chat");
  });
});
