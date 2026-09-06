"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConversationItem, MessageItem } from "@/lib/chat/schemas";
import { parseChatMessageParts, type ChatMessagePart } from "@/lib/chat/persistence";
import { consumeFrontendSseResponse } from "@/lib/tbox/frontend-sse";
import { beginSubscription, isCurrentSubscription, resolveClientRequestId } from "@/lib/assistant-controller-utils";

export type AssistantPhase = "idle" | "waiting" | "speaking";

interface AssistantState {
  activeConversationId: string | null;
  messages: MessageItem[];
  streaming: boolean;
  phase: AssistantPhase;
  draft: string;
}

export interface AssistantController extends AssistantState {
  /** 面板开合（页头按钮与 Kurisu 共享同一面板/控制器）。 */
  panelOpen: boolean;
  expanded: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  toggleExpanded: () => void;
  send: (text: string) => Promise<void>;
  newChat: () => void;
  openHistory: (id: string) => Promise<void>;
  switchConversation: (id: string) => Promise<void>;
  setDraft: (text: string) => void;
  /** 发送失败重试：复用同一 clientRequestId，避免重复写入。 */
  retry: (text: string) => Promise<void>;
}

/**
 * 唯一助手会话控制器：单一消息状态源（activeConversation/messages/stream/draft）。
 * - 切换会话会取消当前显示订阅并隔离写入（旧会话的加增量不会写入新会话）。
 * - 一条逻辑发送被重试时复用同一个 clientRequestId（服务端幂等去重）。
 * - 关闭面板不清空草稿；历史加载保留 message id、parts、status、executionMeta。
 */
export function useAssistantController(): AssistantController {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [phase, setPhase] = useState<AssistantPhase>("idle");
  const [draft, setDraftState] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const requestIdRef = useRef<string | null>(null);
  const subSeqRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  // 把 SSE 的增量/构件合成为 MessageItem（保留 parts、status、executionMeta，不退化为纯字符串）
  const upsertAssistantMessage = useCallback((append: (prev: MessageItem[]) => MessageItem[]) => {
    if (!mountedRef.current) return;
    setMessages((prev) => append(prev));
  }, []);

  const send = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || streaming) return;
    setDraftState("");
    setStreaming(true);
    setPhase("waiting");

    // 一条逻辑发送的 clientRequestId：新提问生成新 id；重试复用
    const isRetry = requestIdRef.current != null;
    const clientRequestId = resolveClientRequestId({ current: requestIdRef.current, retrying: isRetry }, isRetry);
    requestIdRef.current = clientRequestId;

    let convId = activeConversationId;
    if (!convId) {
      try {
        const res = await fetch("/api/chat/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.ok || !body.data?.id) {
          setStreaming(false);
          setPhase("idle");
          return;
        }
        convId = body.data.id as string;
        setActiveConversationId(convId);
      } catch {
        setStreaming(false);
        setPhase("idle");
        return;
      }
    }

    const sub = beginSubscription({ seq: subSeqRef.current });
    subSeqRef.current = sub;

    // 追加用户消息
    upsertAssistantMessage((prev) => [
      ...prev,
      { role: "user", content, status: "completed" } as unknown as MessageItem,
    ]);
    const assistantId = `local-${Date.now()}`;
    upsertAssistantMessage((prev) => [
      ...prev,
      { role: "assistant", content: "", id: assistantId, status: "streaming" } as unknown as MessageItem,
    ]);

    try {
      const response = await fetch(`/api/chat/conversations/${convId}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          clientRequestId,
          interaction: { surface: "chat", action: "message_submit" },
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("对话请求失败");
      }

      let assistantContent = "";

      const sseResult = await consumeFrontendSseResponse(response, {
        onDelta(delta) {
          if (!isCurrentSubscription({ seq: subSeqRef.current }, sub)) return;
          assistantContent += delta;
          setPhase("speaking");
          upsertAssistantMessage((prev) => prev.map((m) =>
            m.id === assistantId ? { ...m, content: assistantContent } : m
          ));
        },
        onArtifact(part) {
          if (!isCurrentSubscription({ seq: subSeqRef.current }, sub)) return;
          // 累积构件到消息的 parts；若该消息还没有 parts 则先创建
          upsertAssistantMessage((prev) => prev.map((m) => {
            if (m.id !== assistantId) return m;
            const parts = parseChatMessageParts((m.parts as unknown) as string);
            return { ...m, parts: [...parts, part] as unknown as typeof m.parts };
          }));
        },
      });

      // 标记完成并写入执行来源
      upsertAssistantMessage((prev) => prev.map((m) =>
        m.id === assistantId
          ? { ...m, content: assistantContent, status: "completed", executionMeta: sseResult.meta ?? undefined } as unknown as MessageItem
          : m
      ));
      requestIdRef.current = null;
    } catch {
      // 发送失败：保留草稿/消息供重试；保持 requestId 以便重试复用同一逻辑发送
      upsertAssistantMessage((prev) => prev.map((m) =>
        m.id === assistantId ? { ...m, content: "发送失败，请重试", status: "failed" } as unknown as MessageItem : m
      ));
      setDraftState(content);
    } finally {
      if (mountedRef.current) {
        setStreaming(false);
        setPhase("idle");
      }
    }
  }, [activeConversationId, streaming, upsertAssistantMessage]);

  const newChat = useCallback(() => {
    subSeqRef.current += 1; // 使进行中的订阅失效
    setMessages([]);
    setActiveConversationId(null);
    requestIdRef.current = null;
    setDraftState("");
  }, []);

  const openHistory = useCallback(async (id: string) => {
    setActiveConversationId(id);
    setStreaming(false);
    setPhase("idle");
    const sub = beginSubscription({ seq: subSeqRef.current });
    subSeqRef.current = sub;
    setMessages([]);
    try {
      const res = await fetch(`/api/chat/conversations/${id}/messages?limit=50`);
      const body = await res.json().catch(() => null);
      if (!isCurrentSubscription({ seq: subSeqRef.current }, sub)) return;
      if (res.ok && body?.ok) setMessages(body.data as MessageItem[]);
    } catch {
      if (!isCurrentSubscription({ seq: subSeqRef.current }, sub)) return;
      setMessages([]);
    }
  }, []);

  const switchConversation = useCallback(async (id: string) => {
    // 切换时取消当前显示订阅并按会话保存状态（本控制器不串话）
    subSeqRef.current += 1;
    await openHistory(id);
  }, [openHistory]);

  const retry = useCallback(async (text: string) => {
    // 复用现有 requestId（resolveClientRequestId 用 retrying=true 分支），或重新发送
    await send(text);
  }, [send]);

  const setDraft = useCallback((text: string) => {
    if (mountedRef.current) setDraftState(text);
  }, []);

  const openPanel = useCallback(() => {
    if (mountedRef.current) setPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    // 关闭仅隐藏，不丢弃当前流或草稿（状态保留在 provider）
    if (mountedRef.current) setPanelOpen(false);
  }, []);

  const togglePanel = useCallback(() => {
    if (mountedRef.current) setPanelOpen((prev) => !prev);
  }, []);

  const toggleExpanded = useCallback(() => {
    if (mountedRef.current) setExpanded((prev) => !prev);
  }, []);

  return {
    activeConversationId,
    messages,
    streaming,
    phase,
    draft,
    panelOpen,
    expanded,
    openPanel,
    closePanel,
    togglePanel,
    toggleExpanded,
    send,
    newChat,
    openHistory,
    switchConversation,
    setDraft,
    retry,
  };
}

export type { ChatMessagePart };
export type { ConversationItem };
