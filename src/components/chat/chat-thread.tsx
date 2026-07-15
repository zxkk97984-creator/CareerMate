"use client";

import { useEffect, useRef, useState } from "react";
import type { MessageItem } from "@/lib/chat/schemas";
import type { ChatMessagePart } from "@/lib/chat/persistence";
import { MessageParts } from "./message-parts";
import { MemoizedMarkdown } from "./memoized-markdown";
import { MessageSquareText, Sparkles, UserRoundCheck } from "lucide-react";

interface ChatThreadProps {
  messages: MessageItem[];
  activeConversationId: string | null;
  onNewChat: (initialMessage?: string) => void;
  onQuickAction?: (actionId: string, value: string) => void;
  /** 是否启用开放聊天入口（OPEN_CHAT_ENTRY flag） */
  openChatEntry?: boolean;
}

const SUGGESTED_QUESTIONS = [
  "我想了解数据分析师需要哪些能力？",
  "AI产品经理的日常工作是什么？",
  "怎样评估我是否适合转行做内容运营？",
  "帮我制定一个3个月的学习计划",
];

/** 画像完善引导的快捷消息 */
const PROFILE_GUIDANCE_MESSAGE = "我想完善我的职业画像";

export function ChatThread({ messages, activeConversationId, onNewChat, onQuickAction, openChatEntry = true }: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [profileGuidanceSent, setProfileGuidanceSent] = useState(false);

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 空状态：欢迎页
  if (!activeConversationId && messages.length === 0) {
    const handleStartProfileGuidance = () => {
      if (profileGuidanceSent) return;
      setProfileGuidanceSent(true);
      // 发送画像引导消息，AI 会在会话中创建 profile_guidance task
      onNewChat(PROFILE_GUIDANCE_MESSAGE);
    };

    return (
      <div className="chat-welcome">
        <div className="welcome-icon">
          <Sparkles size={40} />
        </div>
        <h1 className="welcome-title">你好，我是 CareerMate</h1>
        <p className="welcome-subtitle">
          你的AI职业成长伙伴。可以直接提问，也可以用2分钟完善画像让我更懂你。
        </p>

        {/* 双入口：直接提问 + 完善画像 */}
        {openChatEntry && (
          <div className="welcome-actions" style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 16 }}>
            <button
              className="suggested-btn welcome-primary"
              onClick={handleStartProfileGuidance}
              disabled={profileGuidanceSent}
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <UserRoundCheck size={18} />
              {profileGuidanceSent ? "已发送…" : "用2分钟完善画像"}
            </button>
            <span style={{ color: "var(--cm-text-muted)", fontSize: 13, alignSelf: "center" }}>
              或直接提问 ↓
            </span>
          </div>
        )}

        <p className="welcome-subtitle" style={{ fontSize: 13 }}>
          {openChatEntry ? "试试这些问题：" : "可以先试试这些问题："}
        </p>
        <div className="suggested-questions">
          {SUGGESTED_QUESTIONS.map((q, i) => (
            <button
              key={i}
              className="suggested-btn"
              onClick={() => onNewChat(q)}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-thread" role="log" aria-live="polite" aria-label="聊天消息">
      {messages.map(msg => (
        <div
          key={msg.id}
          className={`message-wrapper ${msg.role === "user" ? "message-user" : "message-assistant"}`}
        >
          <div className="message-avatar">
            {msg.role === "user" ? (
              <div className="avatar-user">我</div>
            ) : (
              <div className="avatar-assistant">
                <MessageSquareText size={16} />
              </div>
            )}
          </div>
          <div className="message-body">
            <div className="message-content">
              {msg.content ? (
                msg.role === "assistant" ? (
                  <MemoizedMarkdown content={msg.content} />
                ) : (
                  <p className="message-text">{msg.content}</p>
                )
              ) : msg.status === "streaming" ? (
                <p className="message-text streaming-cursor">思考中...</p>
              ) : null}
              {msg.parts && msg.parts.length > 0 && (
                <MessageParts parts={msg.parts as ChatMessagePart[]} onQuickAction={onQuickAction} />
              )}
            </div>
            {msg.status === "failed" && (
              <p className="message-error">
                {((msg.parts as any[])?.find((p: any) => p.type === "error") as any)?.message || "回复失败，可以稍后重试"}
              </p>
            )}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
