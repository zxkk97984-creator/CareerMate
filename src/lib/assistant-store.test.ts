import { describe, expect, it, vi } from "vitest";
import { createAssistantStore } from "./assistant-store";
const json = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { headers: { "Content-Type": "application/json" } });
const conv = { id: "c1", title: "职业计划", status: "active", lastMessageAt: "2026-09-07", createdAt: "2026-09-07" };
function stream(text = "你好") { return new Response(`event: delta\ndata: ${JSON.stringify({ text })}\n\nevent: done\ndata: ${JSON.stringify({ meta: { requestedMode: "mock", actualMode: "mock", degraded: false, fallbackReason: null, source: "mock" } })}\n\n`, { headers: { "Content-Type": "text/event-stream" } }); }
describe("shared assistant state", () => {
  it("prevents duplicate sends and preserves complete message records and metadata", async () => {
    let resolve!: (r: Response) => void;
    const fetcher = vi.fn().mockImplementation((url: string) => url.endsWith("/stream") ? new Promise<Response>(r => { resolve = r; }) : Promise.resolve(json(conv)));
    const store = createAssistantStore(fetcher);
    const sending = store.send("你好", "explore");
    await store.send("你好");
    await vi.waitFor(() => expect(resolve).toBeDefined());
    resolve(stream()); await sending;
    const messages = store.getSnapshot().messages;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ conversationId: "c1", role: "user", parts: [], content: "你好" });
    expect(messages[1]).toMatchObject({ content: "你好", status: "completed", executionMeta: { actualMode: "mock" } });
    expect(messages[0].id).not.toBe(messages[1].id);
    const calls = fetcher.mock.calls.filter(([url]) => url.endsWith("/stream"));
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0][1].body)).toMatchObject({ actionId: "explore", interaction: { action: "quick_action" } });
  });
  it("ignores history that finishes after starting a new chat and preserves the new draft", async () => {
    let resolve!: (r: Response) => void;
    const store = createAssistantStore(() => new Promise<Response>(r => { resolve = r; }));
    const loading = store.openHistory("old");
    store.newChat(); store.setDraft("新问题");
    resolve(json([{ id: "old-message", content: "旧消息" }])); await loading;
    expect(store.getSnapshot()).toMatchObject({ activeConversationId: null, messages: [], draft: "新问题", loadingHistory: false });
  });
  it("ignores an old stream after switching conversations", async () => {
    let resolve!: (r: Response) => void;
    const fetcher = vi.fn().mockImplementation((url: string) => url.endsWith("/stream") ? new Promise<Response>(r => { resolve = r; }) : Promise.resolve(json(conv)));
    const store = createAssistantStore(fetcher);
    const sending = store.send("旧问题");
    await vi.waitFor(() => expect(resolve).toBeDefined());
    store.newChat(); store.setDraft("新问题");
    resolve(stream("旧回复")); await sending;
    expect(store.getSnapshot()).toMatchObject({ messages: [], draft: "新问题", streaming: false });
  });
  it("preserves failed text and retries the same logical request without duplicate bubbles", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(conv));
    fetcher.mockImplementation((url: string) => url.endsWith("/stream") ? Promise.reject(new Error("网络断开")) : Promise.resolve(json(conv)));
    const store = createAssistantStore(fetcher);
    await store.send("帮我规划");
    expect(store.getSnapshot()).toMatchObject({ draft: "帮我规划", error: "网络断开" });
    await store.retry("帮我规划");
    const calls = fetcher.mock.calls.filter(([url]) => url.endsWith("/stream"));
    expect(JSON.parse(calls[0][1].body).clientRequestId).toBe(JSON.parse(calls[1][1].body).clientRequestId);
    expect(store.getSnapshot().messages).toHaveLength(2);
  });
});
describe("assistant initialization", () => {
  it("restores the latest persisted conversation on reload", async () => {
    const message = { id: "m1", conversationId: "c1", role: "assistant", content: "历史正文", parts: [{ type: "text", text: "历史正文" }], status: "completed", executionMeta: { actualMode: "api" }, contextMeta: {}, createdAt: "2026-09-07" };
    const store = createAssistantStore(vi.fn().mockResolvedValueOnce(json({ items: [conv] })).mockResolvedValueOnce(json([message])));
    await store.initialize();
    expect(store.getSnapshot()).toMatchObject({ activeConversationId: "c1", messages: [message], loadingHistory: false });
  });
  it("does not replace a deliberately new chat when initial history arrives late", async () => {
    let resolve!: (r: Response) => void;
    const store = createAssistantStore(() => new Promise<Response>(r => { resolve = r; }));
    const loading = store.initialize();
    store.newChat(); store.setDraft("我自己的新问题");
    resolve(json({ items: [conv] })); await loading;
    expect(store.getSnapshot()).toMatchObject({ activeConversationId: null, draft: "我自己的新问题" });
  });
});
