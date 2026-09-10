"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useMotionSafe } from "@/lib/motion/motion-safe";
import type { MessageItem } from "@/lib/chat/schemas";
import type { ChatMessagePart } from "@/lib/chat/persistence";
import { ChatProgress } from "./chat-progress";
import { MessageParts } from "./message-parts";
import { MemoizedMarkdown } from "./memoized-markdown";
import Image from "next/image";
import { ArrowUpRight, Check, Copy, Compass, Route, BookOpen, UserRoundCheck } from "lucide-react";
import Link from "next/link";
import { useCompanionAppearance } from "./companion-appearance-provider";
import { companionAvatarUrl, companionDisplayName } from "./companion-appearance-options";

interface ChatThreadProps {
  messages: MessageItem[];
  activeConversationId: string | null;
  onNewChat: (initialMessage?: string) => void;
  onQuickAction?: (actionId: string, value: string) => void;
  /** 是否启用开放聊天入口（OPEN_CHAT_ENTRY flag） */
  openChatEntry?: boolean;
  /** 是否正在流式回复（用于驱动 Kurisu 动作） */
  streaming?: boolean;
  /** Kurisu 动作阶段：idle / waiting / speaking */
  kurisuPhase?: "idle" | "waiting" | "speaking";
}

function CopyMessage({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return <button className="message-copy" aria-label={copied ? "已复制回复" : "复制回复"} onClick={async () => {
    try { await navigator.clipboard.writeText(content); setCopied(true); setFailed(false); } catch { setFailed(true); }
  }}>{copied ? <Check size={15}/> : <Copy size={15}/>}<span>{failed ? "请选中文字复制" : copied ? "已复制" : "复制"}</span></button>;
}

export function ChatThread({ messages, activeConversationId, onNewChat, onQuickAction }: ChatThreadProps) {
  const { chatAppearance } = useCompanionAppearance();
  const assistantName = companionDisplayName(chatAppearance);
  const assistantAvatar = companionAvatarUrl(chatAppearance);
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const prevLenRef = useRef(0);
  const firstRenderRef = useRef(true);
  const motionSafe = useMotionSafe();

  // 自动滚动到底部
  useEffect(() => {
    const container = bottomRef.current?.closest(".chat-scroll-area") ?? threadRef.current;
    if (!container) return;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distance < 220 || messages.at(-1)?.role === "user") bottomRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
  }, [messages]);

  // 会话切换视为"首帧":重置入场状态,避免历史加载/整体替换触发入场动画
  // (必须在入场 effect 之前声明:同一提交内先重置、后判入场)
  useEffect(() => {
    seenIdsRef.current = new Set();
    prevLenRef.current = 0;
    firstRenderRef.current = true;
  }, [activeConversationId]);

  // 新消息入场:仅对"追加"(长度 +1/+2)且非流式占位的最新一条消息播放一次
  useEffect(() => {
    const len = messages.length;
    if (firstRenderRef.current) {
      messages.forEach((m) => seenIdsRef.current.add(m.id));
      prevLenRef.current = len;
      firstRenderRef.current = false;
      return;
    }
    const delta = len - prevLenRef.current;
    const last = messages[len - 1];
    if (
      motionSafe &&
      delta >= 1 &&
      delta <= 2 &&
      last &&
      !seenIdsRef.current.has(last.id) &&
      last.status !== "streaming" &&
      threadRef.current
    ) {
      const node = threadRef.current.querySelector(`[data-msg-id="${last.id}"]`);
      if (node) {
        gsap.from(node, { opacity: 0, y: 12, duration: 0.35, ease: "power2.out" });
      }
    }
    messages.forEach((m) => seenIdsRef.current.add(m.id));
    prevLenRef.current = len;
  }, [messages, motionSafe]);

  if (!activeConversationId && messages.length === 0) {
    return <div className="chat-welcome" data-od-id="chat-welcome">
      <p className="welcome-eyebrow">{assistantName} · 你的职业成长伙伴</p>
      <h1 className="welcome-title">把下一步，聊清楚。</h1>
      <p className="welcome-subtitle">从你的目标出发，一起找到今天可以做的事。</p>
      <div className="suggested-questions">
        {[
          { icon: Compass, title: "探索职业方向", text: "结合我的背景，帮我探索适合的职业方向" },
          { icon: Route, title: "制定成长计划", text: "帮我制定一个3个月的学习计划" },
          { icon: BookOpen, title: "寻找学习资源", text: "根据我的职业目标，推荐适合当前阶段的学习资源" },
        ].map(item => <button className="suggested-btn" key={item.title} onClick={() => onNewChat(item.text)}><item.icon size={20}/><span>{item.title}</span><ArrowUpRight size={16}/></button>)}
      </div>
      <Link href="/onboarding" className="welcome-profile-link"><UserRoundCheck size={16}/>完善职业画像，让建议更适合你<ArrowUpRight size={15}/></Link>
    </div>;
  }

  return (
    <div ref={threadRef} className="chat-thread" role="log" aria-live="polite" aria-label="聊天消息">
      <div className="conversation-intro"><p className="welcome-eyebrow">{assistantName}</p><h1>把下一步，聊清楚。</h1><p>从你的目标出发，一起找到今天可以做的事。</p></div>
      {messages.map(msg => (
        <div
          key={msg.id}
          data-msg-id={msg.id}
          className={`message-wrapper ${msg.role === "user" ? "message-user" : "message-assistant"}`}
        >
          <div className="message-avatar">
            {msg.role === "user" ? (
              <div className="avatar-user">我</div>
            ) : (
                <Image className="assistant-portrait" src={assistantAvatar} width={40} height={40} alt="" />
            )}
          </div>
          <div className="message-body">
            {msg.role === "assistant" && <span className="message-author">{assistantName}</span>}
            <div className="message-content">
              {msg.content ? (
                msg.role === "assistant" ? (
                  <MemoizedMarkdown content={msg.content} />
                ) : (
                  <p className="message-text">{msg.content}</p>
                )
              ) : msg.status === "streaming" ? (
                <p className="message-text streaming-cursor">
                  <span className="typing-dots" aria-hidden="true"><span /><span /><span /></span>
                </p>
              ) : null}
              {msg.parts && msg.parts.length > 0 && (
                <MessageParts parts={msg.parts as ChatMessagePart[]} onQuickAction={onQuickAction} />
              )}
            </div>
            {msg.role === "assistant" && msg.status === "streaming" && <ChatProgress startedAt={msg.createdAt} content={msg.content} />}
            {msg.role === "assistant" && msg.status === "completed" && msg.content && <CopyMessage content={msg.content}/>}
            {msg.role === "assistant" && typeof msg.executionMeta === "object" && msg.executionMeta !== null && "actualMode" in msg.executionMeta && msg.executionMeta.actualMode !== "api" && <p className="message-source-note">{msg.executionMeta.actualMode === "mock" ? "演示回复" : "本地样例回复"} · 当前未使用实时 AI 结果</p>}
            {msg.status === "failed" && (
              <p className="message-error">
                {"回复未完成，请使用输入框重试"}
              </p>
            )}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
