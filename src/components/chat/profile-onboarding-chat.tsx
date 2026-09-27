"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { extractAiExecutionMeta, fetchApi } from "@/lib/client-api";
import { canCompleteOnboarding, type OnboardingDraft } from "@/lib/onboarding-utils";
import { createOnboardingInitialState, type ActiveOnboardingConversation } from "@/lib/onboarding-resume";
import type { MessageItem } from "@/lib/chat/schemas";
import { ChatComposer } from "./chat-composer";
import { ChatThread } from "./chat-thread";

const educationLabels: Record<string, string> = { freshman: "大一", sophomore: "大二", junior: "大三", senior: "大四", postgraduate: "研究生", career_switcher: "转行 / 转岗", worker: "在职" };
const preferenceLabels: Record<string, string> = { video: "视频", text: "阅读", project: "项目", practice: "实操", mentor: "导师带教" };

function ProfileDraftCard({ draft, completeness, busy, canSave, onSave }: {
  draft: OnboardingDraft; completeness: number; busy: boolean; canSave: boolean; onSave: () => void;
}) {
  const rows = [
    ["学习 / 工作阶段", draft.educationStage ? educationLabels[draft.educationStage] ?? draft.educationStage : undefined],
    ["专业 / 背景", draft.major],
    ["目标岗位", draft.targetRoleLabel],
    ["每周投入", draft.weeklyAvailableHours != null ? `${draft.weeklyAvailableHours} 小时` : undefined],
    ["学习偏好", draft.learningPreference?.map((item) => preferenceLabels[item] ?? item).join("、")],
    ["相关经历", draft.experienceSummary],
    ["现实限制", draft.constraints?.join("、")],
  ];
  return (
    <section className="profile-draft-card" aria-label="待确认的画像草稿">
      <details open>
        <summary><span>本次画像草稿</span><span>{Math.round(completeness * 100)}% 已补充 <ChevronDown size={16} /></span></summary>
        <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={value ? undefined : "is-missing"}>{value || "待补充"}</dd></div>)}</dl>
      </details>
      <div className="profile-draft-actions">
        <Button className="profile-save-button" disabled={busy || !canSave} loading={busy} onClick={onSave}><Check size={16} />确认保存画像</Button>
        <p>{canCompleteOnboarding(completeness) ? "确认后才会更新正式画像。" : "继续聊聊，完整度达到 80% 后即可确认。"}</p>
      </div>
    </section>
  );
}

/** First-time setup and legacy drafts use the existing draft/confirm API in the chat shell. */
export function ProfileOnboardingChat({ onComplete }: { onComplete: () => void }) {
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [draft, setDraft] = useState<OnboardingDraft>({});
  const [completeness, setCompleteness] = useState(0);
  const [input, setInput] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const loadSequence = useRef(0);

  const loadDraft = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setReady(false);
    setError("");
    const response = await fetchApi<{ activeOnboardingConversation: ActiveOnboardingConversation | null }>("/api/me");
    if (sequence !== loadSequence.current) return;
    if (!response.ok) { setError(response.error.message); return; }
    const initial = createOnboardingInitialState(response.data.activeOnboardingConversation);
    setConversationId(initial.conversationId);
    setDraft(initial.draft);
    setCompleteness(initial.completeness);
    setMessages(initial.messages.map((message, index) => ({
      ...message, id: `profile-${initial.conversationId ?? "new"}-${index}`, conversationId: initial.conversationId ?? "profile-draft",
      parts: [], status: "completed", executionMeta: null, contextMeta: null, createdAt: "",
    })));
    setReady(true);
  }, []);

  useEffect(() => {
    void loadDraft();
    return () => { loadSequence.current += 1; };
  }, [loadDraft]);

  async function send(content: string) {
    if (!ready || busyRef.current || !content.trim() || content.length > 2000) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    const common = { conversationId: conversationId ?? "profile-draft", parts: [], executionMeta: null, contextMeta: null, createdAt: new Date().toISOString() };
    setMessages((items) => [...items,
      { ...common, id: userId, role: "user", content, status: "completed" },
      { ...common, id: assistantId, role: "assistant", content: "", status: "streaming" },
    ]);
    try {
      const response = await fetchApi<{ assistantMessage: string; conversationId: string; draft: OnboardingDraft; profileCompleteness: number }>("/api/onboarding/chat", {
        method: "POST", body: JSON.stringify({ message: content, conversationId }),
      });
      if (!response.ok) throw new Error(response.error.message);
      setConversationId(response.data.conversationId);
      setDraft(response.data.draft);
      setCompleteness(response.data.profileCompleteness);
      setMessages((items) => items.map((item) => item.id === assistantId
        ? { ...item, content: response.data.assistantMessage, status: "completed", executionMeta: extractAiExecutionMeta(response.meta) }
        : item));
    } catch (caught) {
      setMessages((items) => items.filter((item) => item.id !== userId && item.id !== assistantId));
      setInput(content);
      setError(caught instanceof Error ? caught.message : "回复未能完成，输入已保留，请重试。");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function complete() {
    if (!conversationId || !canCompleteOnboarding(completeness) || busyRef.current || !ready) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetchApi("/api/onboarding/complete", { method: "POST", body: JSON.stringify({ conversationId }) });
      if (!response.ok) throw new Error(response.error.message);
      onComplete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "画像尚未保存，请重试。");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return <>
    <div className="profile-chat-banner"><span>完善个人画像 · 信息会先保存在草稿中</span><Link href="/chat">先自由聊聊</Link></div>
    <div className="chat-scroll-area">
      {!ready ? <div className="chat-loading" role="status">{error ? "画像草稿暂时未能读取。" : "正在恢复你的画像对话…"}</div> : (
        <ChatThread
          messages={messages}
          activeConversationId={conversationId ?? "profile-draft"}
          onNewChat={() => {}}
          streaming={busy}
          footer={<ProfileDraftCard draft={draft} completeness={completeness} busy={busy} canSave={Boolean(conversationId) && canCompleteOnboarding(completeness)} onSave={() => void complete()} />}
        />
      )}
    </div>
    {error && <div className="chat-feedback" role="alert"><span>{error}</span><button type="button" disabled={busy} onClick={() => void loadDraft()}>重新读取草稿</button></div>}
    <ChatComposer
      placeholder="说说你的背景…"
      maxLength={2000}
      onSend={(text) => void send(text)}
      disabled={!ready || busy}
      activeConversationId={conversationId ?? null}
      value={input}
      onChange={setInput}
    />
  </>;
}
