import type { ConversationItem, MessageItem } from "@/lib/chat/schemas";
import type { AgenticV2Interaction } from "@/lib/chat/agentic-v2-context";
import { consumeFrontendSseResponse } from "@/lib/tbox/frontend-sse";

export interface AssistantState {
  activeConversationId: string | null;
  messages: MessageItem[];
  conversations: ConversationItem[];
  streaming: boolean;
  recovering: boolean;
  phase: "idle" | "waiting" | "speaking";
  draft: string;
  error: string | null;
  historyError: string | null;
  loadingHistory: boolean;
  panelOpen: boolean;
  expanded: boolean;
}
const initialState = (): AssistantState => ({ activeConversationId: null, messages: [], conversations: [], streaming: false, recovering: false, phase: "idle", draft: "", error: null, historyError: null, loadingHistory: false, panelOpen: false, expanded: false });

/** One store per mounted provider. Requests may finish on the server after navigation,
 * but only the current subscription can update the visible conversation. */
export function createAssistantStore(fetcher: typeof fetch = (...args) => fetch(...args)) {
  let state = initialState();
  let initialized = false;
  let sequence = 0;
  let listSequence = 0;
  let streamController: AbortController | null = null;
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  const stopRecovery = () => { if (recoveryTimer) clearTimeout(recoveryTimer); recoveryTimer = null; };
  let historyController: AbortController | null = null;
  let retryRequest: {
    text: string;
    id: string;
    userId: string;
    assistantId: string;
    actionId?: string;
    interaction?: AgenticV2Interaction;
  } | null = null;
  const rememberConversation = (id: string | null) => {
    try {
      if (id) sessionStorage.setItem("careermate-active-conversation", id);
      else sessionStorage.removeItem("careermate-active-conversation");
    } catch { /* Storage can be unavailable in private browsing or SSR. */ }
  };
  const listeners = new Set<() => void>();
  const update = (patch: Partial<AssistantState>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  /** Detach the visible view without aborting an in-flight platform call. */
  const detachStream = () => { stopRecovery(); sequence++; retryRequest = null; };
  const invalidate = () => {
    stopRecovery();
    sequence++;
    streamController?.abort();
    streamController = null;
    historyController?.abort();
    historyController = null;
    retryRequest = null;
  };
  async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetcher(url, init);
    const body = await response.json();
    if (!response.ok || !body?.ok) throw new Error(body?.error?.message ?? "请求失败，请稍后重试");
    return body.data as T;
  }
  function applyHistory(messages: MessageItem[], id: string, token: number) {
    if (token !== sequence) return;
    const pending = messages.some(m => m.role === "assistant" && m.status === "streaming");
    update({ messages, loadingHistory: false, streaming: pending, recovering: pending, phase: pending ? "waiting" : "idle", error: null });
    if (pending) recoveryTimer = setTimeout(() => { void recover(id, token); }, 2_000);
  }
  async function recover(id: string, token: number, retryDelay = 2_000) {
    if (token !== sequence) return;
    try {
      const messages = await request<MessageItem[]>(`/api/chat/conversations/${encodeURIComponent(id)}/messages?limit=100`, { cache: "no-store" });
      if (token !== sequence) return;
      applyHistory(messages, id, token);
    } catch {
      if (token !== sequence) return;
      update({ error: "连接暂时中断，正在自动恢复回答…", recovering: true });
      recoveryTimer = setTimeout(() => { void recover(id, token, Math.min(retryDelay * 2, 30_000)); }, retryDelay);
    }
  }
  const actions = {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setDraft: (draft: string) => update({ draft }),
    openPanel: () => update({ panelOpen: true }),
    closePanel: () => update({ panelOpen: false }),
    togglePanel: () => update({ panelOpen: !state.panelOpen }),
    toggleExpanded: () => update({ expanded: !state.expanded }),
    reset: () => { rememberConversation(null); invalidate(); initialized = false; listSequence++; update(initialState()); },
    newChat: () => { if (typeof window !== "undefined" && window.location.pathname === "/chat") window.history.replaceState(null, "", "/chat"); rememberConversation(null); detachStream(); update({ activeConversationId: null, messages: [], streaming: false, recovering: false, phase: "idle", draft: "", error: null, loadingHistory: false }); },
    async initialize() {
      if (initialized) return;
      initialized = true;
      const token = sequence;
      await actions.reloadConversations();
      let saved: string | null = null;
      try { saved = sessionStorage.getItem("careermate-active-conversation"); } catch { /* unavailable */ }
      const restored = state.conversations.find(item => item.id === saved) ?? state.conversations[0];
      if (token === sequence && !state.activeConversationId && restored) await actions.openHistory(restored.id);
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
      if (typeof window !== "undefined" && window.location.pathname === "/chat") {
        window.history.replaceState(null, "", `/chat?conversationId=${encodeURIComponent(id)}`);
      }
      rememberConversation(id);
      detachStream();
      historyController?.abort();
      const token = sequence;
      const history = new AbortController();
      historyController = history;
      update({ activeConversationId: id, messages: [], streaming: false, recovering: false, phase: "idle", loadingHistory: true, draft: "", error: null });
      try {
        const messages = await request<MessageItem[]>(`/api/chat/conversations/${encodeURIComponent(id)}/messages?limit=100`, { signal: history.signal });
        if (sequence === token) applyHistory(messages, id, token);
      } catch (error) {
        if (sequence === token) update({ loadingHistory: false, error: error instanceof Error ? error.message : "消息加载失败" });
      } finally {
        if (historyController === history) historyController = null;
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
    async send(text: string, actionId?: string, interaction?: AgenticV2Interaction) {
      const content = text.trim();
      if (!content || content.length > 8000 || state.streaming || state.loadingHistory) return;
      const previous = retryRequest?.text === content
        && retryRequest.actionId === actionId
        && JSON.stringify(retryRequest.interaction ?? null) === JSON.stringify(interaction ?? null)
        ? retryRequest
        : null;
      const turn = previous ?? {
        text: content,
        id: crypto.randomUUID(),
        userId: crypto.randomUUID(),
        assistantId: crypto.randomUUID(),
        actionId,
        interaction,
      };
      retryRequest = turn;
      const token = ++sequence;
      const activeStream = new AbortController();
      streamController = activeStream;
      const signal = activeStream.signal;
      update({ streaming: true, recovering: false, phase: "waiting", draft: "", error: null });
      let accepted = false;
      let conversationId = state.activeConversationId;
      try {
        if (!conversationId) {
          const conversation = await request<ConversationItem>("/api/chat/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: content.slice(0, 60) }), signal });
          if (token !== sequence) return;
          conversationId = conversation.id;
          rememberConversation(conversationId);
          update({ activeConversationId: conversationId, conversations: [conversation, ...state.conversations] });
        }
        const makeMessage = (role: string, id: string, value: string): MessageItem => ({ id, conversationId: conversationId!, role, content: value, parts: [], status: role === "user" ? "completed" : "streaming", executionMeta: {}, contextMeta: {}, createdAt: new Date().toISOString() });
        const oldMessages = state.messages.filter(m => m.id !== turn.userId && m.id !== turn.assistantId);
        update({ messages: [...oldMessages, makeMessage("user", turn.userId, content), makeMessage("assistant", turn.assistantId, "")] });
        const response = await fetcher(`/api/chat/conversations/${encodeURIComponent(conversationId)}/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            message: content,
            clientRequestId: turn.id,
            ...(turn.actionId ? { actionId: turn.actionId } : {}),
            interaction: turn.interaction
              ?? { surface: "chat", action: turn.actionId ? "quick_action" : "message_submit" },
          }),
        });
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
            accepted = true;
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
        if (accepted && conversationId) {
          update({ recovering: true, phase: "waiting" });
          await recover(conversationId, token);
          return;
        }
        update({ error: error instanceof Error ? error.message : "发送失败，请重试", draft: content, messages: state.messages.map(m => m.id === turn.assistantId ? { ...m, status: "failed" } : m) });
      } finally {
        if (streamController === activeStream) streamController = null;
        if (token === sequence && !state.recovering) update({ streaming: false, phase: "idle" });
      }
    },
    async retry(text: string) { await actions.send(text); },
  };
  return actions;
}
export type AssistantStore = ReturnType<typeof createAssistantStore>;
