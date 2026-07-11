"use client";

import { useEffect, useRef } from "react";
import type { MessageItem } from "@/lib/chat/schemas";
import type { ChatMessagePart } from "@/lib/chat/persistence";
import { MessageParts } from "./message-parts";
import { MessageSquareText, Sparkles } from "lucide-react";

interface ChatThreadProps {
  messages: MessageItem[];
  activeConversationId: string | null;
  onNewChat: (initialMessage?: string) => void;
}

const SUGGESTED_QUESTIONS = [
  "我想了解数据分析师需要哪些能力？",
  "AI产品经理的日常工作是什么？",
  "怎样评估我是否适合转行做内容运营？",
  "帮我制定一个3个月的学习计划",
];

export function ChatThread({ messages, activeConversationId, onNewChat }: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 空状态：欢迎页
  if (!activeConversationId && messages.length === 0) {
    return (
      <div className="chat-welcome">
        <div className="welcome-icon">
          <Sparkles size={40} />
        </div>
        <h1 className="welcome-title">你好，我是 CareerMate</h1>
        <p className="welcome-subtitle">
          你的AI职业成长伙伴。可以先试试这些问题：
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
                <p className="message-text">{msg.content}</p>
              ) : msg.status === "streaming" ? (
                <p className="message-text streaming-cursor">思考中...</p>
              ) : null}
              {msg.parts && msg.parts.length > 0 && (
                <MessageParts parts={msg.parts as ChatMessagePart[]} />
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
