"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConversationSidebar } from "./conversation-sidebar";
import { ChatThread } from "./chat-thread";
import { ChatComposer } from "./chat-composer";
import { GrowthProfileDrawer } from "./growth-profile-drawer";
import type { ConversationItem, MessageItem } from "@/lib/chat/schemas";
import { consumeFrontendSseResponse } from "@/lib/tbox/frontend-sse";
import { Menu, PanelRightClose, PanelRightOpen } from "lucide-react";

interface ChatHomePageProps {
  userId: string;
  displayName: string;
}

export function ChatHomePage({ displayName }: ChatHomePageProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingCandidateCount, setPendingCandidateCount] = useState(0);

  // 用 ref 追踪当前活跃会话和流式状态，避免闭包过期
  const activeCidRef = useRef<string | null>(null);
  const streamingRef = useRef(false);

  // 加载会话列表
  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/chat/conversations?limit=30");
    if (!res.ok) return;
    const body = await res.json();
    if (body.ok) setConversations(body.data.items);
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // 加载待确认候选数量
  useEffect(() => {
    fetch("/api/profile/candidates")
      .then(r => r.json())
      .then(b => {
        if (b.ok) {
          const items = (b.data as { items?: Array<{ status: string }> })?.items ?? [];
          const pending = items.filter((c) => c.status === "pending");
          setPendingCandidateCount(pending.length);
        }
      })
      .catch(() => {});
  }, []);

  // 切换会话时加载消息
  useEffect(() => {
    activeCidRef.current = activeConversationId;
    if (!activeConversationId) {
      setMessages([]);
      return;
    }
    // 新会话发送的本地乐观消息优先于历史请求。否则空历史会在
    // SSE 开始后返回，并覆盖刚加入的用户/助手消息。
    if (streamingRef.current) return;

    const requestedConversationId = activeConversationId;
    const controller = new AbortController();
    fetch(`/api/chat/conversations/${requestedConversationId}/messages?limit=50`, {
      signal: controller.signal,
    })
      .then(r => r.json())
      .then(b => {
        if (
          b.ok &&
          activeCidRef.current === requestedConversationId &&
          !streamingRef.current
        ) {
          setMessages(b.data);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [activeConversationId]);

  /** 核心发送逻辑：给定会话 ID 和文本，执行 SSE 流式请求 */
  const doSend = useCallback(async (cid: string, text: string) => {
    if (streamingRef.current) return; // 防止并发发送
    streamingRef.current = true;
    setIsStreaming(true);

    // 添加用户消息到本地
    const userMsg: MessageItem = {
      id: "temp-user-" + Date.now(),
      conversationId: cid,
      role: "user",
      content: text,
      parts: [],
      status: "completed",
      executionMeta: {},
      contextMeta: {},
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    // 创建助手占位消息
    const assistantMsg: MessageItem = {
      id: "temp-asst-" + Date.now(),
      conversationId: cid,
      role: "assistant",
      content: "",
      parts: [],
      status: "streaming",
      executionMeta: {},
      contextMeta: {},
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, assistantMsg]);

    // 发起SSE流式请求
    const response = await fetch(`/api/chat/conversations/${cid}/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });

    if (!response.ok || !response.body) {
      setMessages(prev =>
        prev.map(m => m.id === assistantMsg.id
          ? { ...m, status: "failed", parts: [{ type: "error", code: "HTTP_ERROR", message: "发送失败" }] }
          : m,
        ),
      );
      streamingRef.current = false;
      setIsStreaming(false);
      return;
    }

    // 使用共享 SSE 消费器，正确处理跨网络 chunk 拆分的 event/data。
    let assistantContent = "";

    try {
      await consumeFrontendSseResponse(response, {
        onDelta(content) {
          assistantContent += content;
          setMessages(prev =>
            prev.map(m => m.id === assistantMsg.id
              ? { ...m, content: assistantContent }
              : m,
            ),
          );
        },
        onArtifact(part) {
          if (part.type === "profile_candidate_ref") {
            setPendingCandidateCount((count) => count + 1);
          }
          setMessages(prev =>
            prev.map(m => m.id === assistantMsg.id
              ? { ...m, parts: [...m.parts, part] }
              : m,
            ),
          );
        },
      });
      setMessages(prev =>
        prev.map(m => m.id === assistantMsg.id
          ? { ...m, content: assistantContent, status: "completed" }
          : m,
        ),
      );
    } catch {
      setMessages(prev =>
        prev.map(m => m.id === assistantMsg.id
          ? { ...m, status: "failed", content: assistantContent }
          : m,
        ),
      );
    }

    streamingRef.current = false;
    setIsStreaming(false);

    // 刷新会话列表以获取更新的标题
    loadConversations();
  }, [loadConversations]);

  /** 创建新会话，可选自动发送初始消息 */
  const handleNewChat = useCallback(async (initialMessage?: string) => {
    try {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) return;
      const body = await res.json();
      if (body.ok && body.data?.id) {
        setConversations(prev => [body.data, ...prev]);
        setActiveConversationId(body.data.id);
        activeCidRef.current = body.data.id;
        setMessages([]);
        // 如果传入了初始消息，直接发送（使用新会话 ID，避免闭包问题）
        if (initialMessage) {
          doSend(body.data.id, initialMessage);
        }
      }
    } catch {
      // 网络错误等，静默忽略
    }
  }, [doSend]);

  /** 发送消息：如果无活跃会话则自动创建 */
  const handleSendMessage = useCallback(async (text: string) => {
    let convId: string | null = activeCidRef.current;

    // 如果还没有活跃会话，先创建一个
    if (!convId) {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) return;
      const body = await res.json();
      if (!body.ok) return;
      convId = body.data.id as string;
      setConversations(prev => [body.data, ...prev]);
      setActiveConversationId(convId);
      activeCidRef.current = convId;
    }

    await doSend(convId, text);
  }, [doSend]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    const res = await fetch(`/api/chat/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeCidRef.current === id) {
      setActiveConversationId(null);
      activeCidRef.current = null;
      setMessages([]);
    }
  }, []);

  const handleRenameConversation = useCallback(async (id: string, title: string) => {
    const res = await fetch(`/api/chat/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return;
    const body = await res.json();
    if (body.ok) {
      setConversations(prev => prev.map(c => c.id === id ? { ...c, title: body.data.title } : c));
    }
  }, []);

  return (
    <div className="chat-home-layout">
      {/* 移动端遮罩 */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 左侧会话栏 */}
      <ConversationSidebar
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={id => {
          setMessages([]);
          setActiveConversationId(id);
          activeCidRef.current = id;
          setSidebarOpen(false);
        }}
        onNew={handleNewChat}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
        pendingCandidateCount={pendingCandidateCount}
        displayName={displayName}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* 中间聊天区 */}
      <main className="chat-main">
        {/* 移动端菜单按钮 */}
        <button
          className="mobile-menu-btn"
          onClick={() => setSidebarOpen(true)}
          aria-label="打开会话列表"
        >
          <Menu size={20} />
        </button>

        {/* 成长档案切换按钮 */}
        <button
          className="profile-toggle-btn"
          onClick={() => setDrawerOpen(!drawerOpen)}
          aria-label={drawerOpen ? "收起成长档案" : "展开成长档案"}
        >
          {drawerOpen ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
          {pendingCandidateCount > 0 && (
            <span className="candidate-badge">{pendingCandidateCount}</span>
          )}
        </button>

        <ChatThread
          messages={messages}
          activeConversationId={activeConversationId}
          onNewChat={handleNewChat}
        />

        <ChatComposer
          onSend={handleSendMessage}
          disabled={isStreaming}
          activeConversationId={activeConversationId}
        />
      </main>

      {/* 右侧成长档案 */}
      <GrowthProfileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        pendingCandidateCount={pendingCandidateCount}
      />
    </div>
  );
}
