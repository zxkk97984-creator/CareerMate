import type { ConversationItem, MessageItem } from "@/lib/chat/schemas";
import { consumeFrontendSseResponse } from "@/lib/tbox/frontend-sse";

export interface AssistantState {
  activeConversationId: string | null;
  messages: MessageItem[];
  conversations: ConversationItem[];
  streaming: boolean;
  phase: "idle" | "waiting" | "speaking";
  draft: string;
  error: string | null;
  historyError: string | null;
  loadingHistory: boolean;
  panelOpen: boolean;
  expanded: boolean;
}
const initialState = (): AssistantState => ({ activeConversationId: null, messages: [], conversations: [], streaming: false, phase: "idle", draft: "", error: null, historyError: null, loadingHistory: false, panelOpen: false, expanded: false });

/** One store per mounted provider. Requests may finish on the server after navigation,
 * but only the current subscription can update the visible conversation. */
export function createAssistantStore(fetcher: typeof fetch = (...args) => fetch(...args)) {
  let state = initialState();
  let initialized = false;
  let sequence = 0;
  let listSequence = 0;
  let controller: AbortController | null = null;
  let retryRequest: { text: string; id: string; userId: string; assistantId: string; actionId?: string } | null = null;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<AssistantState>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const invalidate = () => { sequence++; controller?.abort(); controller = null; retryRequest = null; };
  async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetcher(url, init);
    const body = await response.json();
    if (!response.ok || !body?.ok) throw new Error(body?.error?.message ?? "请求失败，请稍后重试");
    return body.data as T;
  }
  const actions = {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setDraft: (draft: string) => update({ draft }),
    openPanel: () => update({ panelOpen: true }),
    closePanel: () => update({ panelOpen: false }),
    togglePanel: () => update({ panelOpen: !state.panelOpen }),
    toggleExpanded: () => update({ expanded: !state.expanded }),
    reset: () => { invalidate(); initialized = false; listSequence++; update(initialState()); },
    newChat: () => { invalidate(); update({ activeConversationId: null, messages: [], streaming: false, phase: "idle", draft: "", error: null, loadingHistory: false }); },
    async initialize() {
      if (initialized) return;
      initialized = true;
      const token = sequence;
      await actions.reloadConversations();
      if (token === sequence && !state.activeConversationId && state.conversations[0]) await actions.openHistory(state.conversations[0].id);
    },
    async reloadConversations() {
      const token = ++listSequence;
      try {
        const result = await request<{ items: ConversationItem[] }>("/api/chat/conversations?limit=100");
        if (token === listSequence) update({ conversations: result.items ?? [], historyError: null });
      } catch (error) {
        if (token === listSequence) update({ historyError: error instanceof Error ? error.message : "历史会话加载失败" });
      }
    },
    async openHistory(id: string) {
      invalidate(); const token = sequence;
      controller = new AbortController();
      update({ activeConversationId: id, messages: [], streaming: false, phase: "idle", loadingHistory: true, draft: "", error: null });
      try {
        const messages = await request<MessageItem[]>(`/api/chat/conversations/${encodeURIComponent(id)}/messages?limit=100`, { signal: controller.signal });
        if (sequence === token) update({ messages, loadingHistory: false });
      } catch (error) {
        if (sequence === token) update({ loadingHistory: false, error: error instanceof Error ? error.message : "消息加载失败" });
      }
    },
    async switchConversation(id: string) { await actions.openHistory(id); },
    async renameConversation(id: string, title: string) {
      try {
        await request(`/api/chat/conversations/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
        await actions.reloadConversations();
      } catch (error) { update({ historyError: error instanceof Error ? error.message : "重命名失败" }); }
    },
    async deleteConversation(id: string) {
      try {
        await request(`/api/chat/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (state.activeConversationId === id) actions.newChat();
        await actions.reloadConversations();
      } catch (error) { update({ historyError: error instanceof Error ? error.message : "删除失败" }); }
    },
    async send(text: string, actionId?: string) {
      const content = text.trim();
      if (!content || content.length > 8000 || state.streaming || state.loadingHistory) return;
      const previous = retryRequest?.text === content ? retryRequest : null;
      const turn = previous ?? { text: content, id: crypto.randomUUID(), userId: crypto.randomUUID(), assistantId: crypto.randomUUID(), actionId };
      retryRequest = turn;
      const token = ++sequence;
      controller = new AbortController();
      const signal = controller.signal;
      update({ streaming: true, phase: "waiting", draft: "", error: null });
      let conversationId = state.activeConversationId;
      try {
        if (!conversationId) {
          const conversation = await request<ConversationItem>("/api/chat/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: content.slice(0, 60) }), signal });
          if (token !== sequence) return;
          conversationId = conversation.id;
          update({ activeConversationId: conversationId, conversations: [conversation, ...state.conversations] });
        }
        const makeMessage = (role: string, id: string, value: string): MessageItem => ({ id, conversationId: conversationId!, role, content: value, parts: [], status: role === "user" ? "completed" : "streaming", executionMeta: {}, contextMeta: {}, createdAt: new Date().toISOString() });
        const oldMessages = state.messages.filter(m => m.id !== turn.userId && m.id !== turn.assistantId);
        update({ messages: [...oldMessages, makeMessage("user", turn.userId, content), makeMessage("assistant", turn.assistantId, "")] });
        const response = await fetcher(`/api/chat/conversations/${encodeURIComponent(conversationId)}/stream`, { method: "POST", headers: { "Content-Type": "application/json" }, signal, body: JSON.stringify({ message: content, clientRequestId: turn.id, ...(turn.actionId ? { actionId: turn.actionId } : {}), interaction: { surface: "chat", action: turn.actionId ? "quick_action" : "message_submit" } }) });
        const patchAssistant = (patch: Partial<MessageItem>) => update({ messages: state.messages.map(m => m.id === turn.assistantId ? { ...m, ...patch } : m) });
        let assistantContent = "";
        const result = await consumeFrontendSseResponse(response, {
          onDelta(delta) {
            if (token !== sequence) return;
            assistantContent += delta;
            patchAssistant({ content: assistantContent }); update({ phase: "speaking" });
          },
          onContext(context) {
            if (token !== sequence) return;
            const oldUserId = turn.userId; const oldAssistantId = turn.assistantId;
            turn.userId = context.userMessageId ?? turn.userId;
            turn.assistantId = context.assistantMessageId ?? turn.assistantId;
            update({ messages: state.messages.map(m => m.id === oldUserId ? { ...m, id: turn.userId } : m.id === oldAssistantId ? { ...m, id: turn.assistantId, contextMeta: context } : m) });
          },
          onArtifact(part) {
            if (token !== sequence) return;
            const message = state.messages.find(m => m.id === turn.assistantId);
            patchAssistant({ parts: [...(message?.parts ?? []), part] });
          },
        });
        if (token !== sequence) return;
        patchAssistant({ status: "completed", executionMeta: result.meta });
        retryRequest = null;
        // Canonical history includes structured text edits, references and candidate IDs.
        try {
          const saved = await request<MessageItem[]>(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages?limit=100`, { signal });
          if (token === sequence && Array.isArray(saved) && saved.length > 0) update({ messages: saved });
        } catch { /* Keep the successfully streamed response if history refresh fails. */ }
        void actions.reloadConversations();
      } catch (error) {
        if (token !== sequence) return;
        update({ error: error instanceof Error ? error.message : "发送失败，请重试", draft: content, messages: state.messages.map(m => m.id === turn.assistantId ? { ...m, status: "failed" } : m) });
      } finally {
        if (token === sequence) update({ streaming: false, phase: "idle" });
      }
    },
    async retry(text: string) { await actions.send(text); },
  };
  return actions;
}
export type AssistantStore = ReturnType<typeof createAssistantStore>;
