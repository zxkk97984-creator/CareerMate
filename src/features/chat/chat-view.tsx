"use client";

import { useState, type ReactNode } from "react";
import type { CareerChatContextMeta, CareerChatIntent } from "@/lib/chat/types";
import { consumeFrontendSseResponse } from "@/lib/tbox/frontend-sse";
import type { AiExecutionMeta } from "@/lib/types";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const intentLabels: Record<CareerChatIntent, string> = {
  roleCompetency: "岗位能力",
  learningResources: "学习资源",
  simulationScenes: "模拟训练",
  ethicsRules: "隐私规则",
};

function nextId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function Panel({ children, action }: { children: ReactNode; action: ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--cm-border)] bg-[var(--cm-surface)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--cm-border)] px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--cm-text-strong)]">CareerMate 智能聊天</h2>
          <p className="mt-1 text-xs text-[var(--cm-text-muted)]">当前页面内保持多轮上下文，刷新后自动清空。</p>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function ContextBadges({
  context,
  execution,
}: {
  context: CareerChatContextMeta | null;
  execution: AiExecutionMeta | null;
}) {
  if (!context && !execution) return null;
  const badges = [
    context?.intent ? `意图：${intentLabels[context.intent]}` : null,
    context?.usedProfile ? "已使用画像" : null,
    context?.usedPlan ? "已使用当前计划" : null,
    context?.usedMemoryCount ? `已使用 ${context.usedMemoryCount} 条记忆` : null,
    execution
      ? `聊天 ${execution.requestedMode} → ${execution.actualMode}${execution.degraded ? "（已降级）" : ""}`
      : null,
  ].filter((value): value is string => Boolean(value));
  return (
    <div className="space-y-2" aria-label="聊天上下文">
      <div className="flex flex-wrap gap-2">
        {badges.map((badge) => (
          <span key={badge} className="rounded-full bg-[var(--cm-surface-soft)] px-3 py-1 text-xs text-[var(--cm-text-muted)]">
            {badge}
          </span>
        ))}
      </div>
      {context?.knowledgeSources.length ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--cm-text-muted)]">
          <span>知识来源</span>
          {context.knowledgeSources.map((source) => (
            <span key={source} className="rounded bg-[var(--cm-info-bg)] px-2 py-1 text-[var(--cm-info)]">
              {source}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ChatView({ setNotice }: { setNotice: (value: string) => void }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [contextMeta, setContextMeta] = useState<CareerChatContextMeta | null>(null);
  const [executionMeta, setExecutionMeta] = useState<AiExecutionMeta | null>(null);

  async function send() {
    const content = question.trim();
    if (!content || streaming) return;
    const assistantId = nextId();
    setMessages((previous) => [
      ...previous,
      { id: nextId(), role: "user", content },
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setStreaming(true);
    setNotice("CareerMate 正在结合你的画像和知识库思考...");
    try {
      const response = await fetch("/api/tbox/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: content, conversationId: conversationId ?? undefined }),
      });
      const result = await consumeFrontendSseResponse(response, {
        onDelta(delta) {
          setMessages((previous) =>
            previous.map((message) =>
              message.id === assistantId
                ? { ...message, content: `${message.content}${delta}` }
                : message,
            ),
          );
        },
        onContext(context) {
          setContextMeta(context);
        },
      });
      setConversationId(result.conversationId);
      setExecutionMeta(result.meta);
      setQuestion("");
      setNotice("对话完成；回答已结合允许使用的职业上下文。");
    } catch (error) {
      setMessages((previous) =>
        previous.map((message) =>
          message.id === assistantId && !message.content
            ? {
                ...message,
                content: error instanceof Error ? error.message : "对话失败，请稍后重试。",
              }
            : message,
        ),
      );
      setNotice("对话失败，请检查登录状态或稍后重试。你的输入已保留。");
    } finally {
      setStreaming(false);
    }
  }

  function resetConversation() {
    if (streaming) return;
    setMessages([]);
    setConversationId(null);
    setContextMeta(null);
    setExecutionMeta(null);
    setQuestion("");
    setNotice("已开始新的页面会话。");
  }

  return (
    <Panel
      action={
        <button
          type="button"
          disabled={streaming || messages.length === 0}
          onClick={resetConversation}
          className="h-9 rounded-md border border-[var(--cm-border-strong)] bg-[var(--cm-surface)] px-3 text-sm font-semibold text-[var(--cm-text-strong)] hover:bg-[var(--cm-surface-soft)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          开始新对话
        </button>
      }
    >
      <div className="space-y-4">
        <ContextBadges context={contextMeta} execution={executionMeta} />
        <div className="min-h-56 space-y-3 rounded-lg bg-[var(--cm-surface-soft)] p-4" aria-label="聊天记录">
          {messages.length === 0 ? (
            <div className="flex min-h-48 items-center justify-center text-center text-sm leading-6 text-[var(--cm-text-muted)]">
              你可以询问岗位能力、学习资源、模拟训练或隐私设置。CareerMate 会自动选择相关知识库。
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-3xl rounded-lg px-4 py-3 text-sm leading-7 whitespace-pre-wrap ${
                  message.role === "user" ? "ml-auto" : ""
                }`}
                style={
                  message.role === "user"
                    ? { background: "var(--cm-gradient-brand)", color: "#fff" }
                    : { background: "var(--cm-surface)", border: "1px solid var(--cm-border)", color: "var(--cm-text-strong)" }
                }
              >
                {message.content || (streaming ? "正在生成..." : "")}
              </div>
            ))
          )}
        </div>
        <div className="space-y-3">
          <textarea
            aria-label="聊天问题"
            className="min-h-28 w-full rounded-md border border-[var(--cm-border-strong)] p-3 text-sm leading-6 outline-none focus:border-[var(--cm-brand)] focus:ring-2 focus:ring-[var(--cm-brand-soft)]"
            placeholder="例如：结合我的目标岗位和本月计划，我现在最应该先完成什么？"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--cm-text-muted)]">
              {conversationId ? "正在延续当前多轮会话" : "新会话将在首次回答后建立"}
            </span>
            <button
              type="button"
              disabled={streaming || !question.trim()}
              onClick={send}
              className="h-10 rounded-md px-5 text-sm font-semibold hover:brightness-[0.92] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "var(--cm-gradient-brand)", color: "#fff" }}
            >
              {streaming ? "生成中..." : "发送"}
            </button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
