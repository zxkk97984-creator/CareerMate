"use client";

/** 对话式画像引导 —— 多轮对话 + 画像摘要 + 确认生成工作台 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { canCompleteOnboarding, type OnboardingDraft } from "@/lib/onboarding-utils";
import { createOnboardingInitialState, type ActiveOnboardingConversation } from "@/lib/onboarding-resume";
import type { AiRuntimeSnapshot } from "@/lib/ai-runtime";
import type { OnboardingMessage } from "@/lib/workspace-types";
import { fetchApi } from "@/lib/client-api";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";

/* ── 主视图 ── */

interface OnboardingViewProps { refresh: () => Promise<void>; setNotice: (v: string) => void; setAiExecution: (v: AiRuntimeSnapshot) => void; activeConversation: ActiveOnboardingConversation | null; }

export function OnboardingView({ refresh, setNotice, setAiExecution, activeConversation }: OnboardingViewProps) {
  const router = useRouter();
  const init = createOnboardingInitialState(activeConversation);
  const [conversationId, setConversationId] = useState<string | undefined>(init.conversationId);
  const [draft, setDraft] = useState<OnboardingDraft>(init.draft);
  const [completeness, setCompleteness] = useState(init.completeness);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<OnboardingMessage[]>(init.messages);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    const content = message.trim(); if (!content || loading) return;
    setLoading(true); setError(""); setMessage("");
    setMessages((cur) => [...cur, { role: "user", content }]);
    setNotice("CareerMate 正在整理画像信息...");
    try {
      const r = await fetchApi<{ assistantMessage: string; conversationId: string; draft: OnboardingDraft; profileCompleteness: number }>("/api/onboarding/chat", { method: "POST", body: JSON.stringify({ message: content, conversationId }) });
      if (!r.ok) throw new Error(r.error?.message ?? "画像对话失败");
      setConversationId(r.data.conversationId); setDraft(r.data.draft); setCompleteness(r.data.profileCompleteness);
      setMessages((cur) => [...cur, { role: "assistant", content: r.data.assistantMessage }]);
      if (r.meta) setAiExecution(r.meta);
      setNotice(`画像完整度已更新到 ${Math.round(r.data.profileCompleteness * 100)}%。`);
    } catch (caught: any) { setError(caught.message ?? "画像对话失败，请稍后重试"); setMessage(content); setNotice("画像对话失败，你的输入已保留，可以重试。"); }
    finally { setLoading(false); }
  }

  async function complete() {
    if (!conversationId || !canCompleteOnboarding(completeness) || loading) return;
    setLoading(true); setError(""); setNotice("正在确认并保存职业画像...");
    try {
      const r = await fetchApi<{ alreadyCompleted: boolean }>("/api/onboarding/complete", { method: "POST", body: JSON.stringify({ conversationId }) });
      if (!r.ok) throw new Error(r.error?.message ?? "画像确认失败");
      setNotice(r.data.alreadyCompleted ? "画像此前已经确认。" : "职业画像已确认，成长工作台已更新。");
      await refresh(); router.push("/"); router.refresh();
    } catch (caught: any) { setError(caught.message ?? "画像确认失败，请稍后重试"); setNotice("画像尚未保存，请检查完整度后重试。"); }
    finally { setLoading(false); }
  }

  const summary: [string, string | undefined][] = [
    ["阶段", draft.educationStage], ["专业/背景", draft.major], ["目标岗位", draft.targetRoleLabel],
    ["每周投入", draft.weeklyAvailableHours ? `${draft.weeklyAvailableHours} 小时` : undefined],
    ["学习偏好", draft.learningPreference?.join("、")], ["相关经历", draft.experienceSummary], ["现实限制", draft.constraints?.join("、")],
  ];

  return (
    <div style={{ display: "grid", gap: 20 }} className="grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)] max-lg:grid-cols-1">
      <SurfaceCard title="对话式画像引导">
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--cm-text-muted)" }}>画像完整度</span>
            <span style={{ fontWeight: 600, color: "var(--cm-text-strong)" }}>{Math.round(completeness * 100)}%</span>
          </div>
          <div style={{ marginTop: 8, height: 6, borderRadius: 999, background: "var(--cm-surface-sunken)", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 999, background: "var(--cm-brand)", width: `${Math.round(completeness * 100)}%`, transition: "width 0.5s cubic-bezier(0.23,1,0.32,1)" }} />
          </div>
        </div>
        <div style={{ maxHeight: 430, overflowY: "auto", borderRadius: "var(--cm-radius-control)", background: "var(--cm-canvas)", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {messages.map((item, i) => (
            <div key={`${item.role}-${i}`} style={{
              maxWidth: "88%", borderRadius: "var(--cm-radius-control)", padding: "12px 16px", fontSize: 14, lineHeight: 1.6,
              ...(item.role === "user"
                ? { marginLeft: "auto", background: "var(--cm-text-strong)", color: "#fff" }
                : { border: "1px solid var(--cm-border)", background: "var(--cm-surface)", color: "var(--cm-text-strong)" }),
            }}>{item.content}</div>
          ))}
        </div>
        <textarea
          style={{ marginTop: 16, minHeight: 96, width: "100%", borderRadius: "var(--cm-radius-control)", border: "1px solid var(--cm-border-strong)", padding: 12, fontSize: 14, lineHeight: 1.6, color: "var(--cm-text-strong)", background: "var(--cm-surface)", resize: "vertical" }}
          placeholder="一次可以告诉我多项信息，例如：我是大三统计学专业，想做数据分析，每周有 8 小时……"
          value={message} onChange={(e) => setMessage(e.target.value)}
        />
        {error ? <div style={{ marginTop: 12 }}><InlineAlert tone="error">{error}</InlineAlert></div> : null}
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <Button variant="secondary" disabled={loading || !message.trim()} onClick={send}>{loading ? "处理中..." : "发送"}</Button>
          <span style={{ fontSize: 12, color: "var(--cm-text-subtle)" }}>确认前不会改写正式画像</span>
        </div>
      </SurfaceCard>

      <SurfaceCard title="画像摘要">
        <dl style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {summary.map(([label, value]) => (
            <div key={label} style={{ borderRadius: "var(--cm-radius-sm)", border: "1px solid var(--cm-border)", background: "var(--cm-canvas)", padding: "8px 12px" }}>
              <dt style={{ fontSize: 12, fontWeight: 500, color: "var(--cm-text-subtle)" }}>{label}</dt>
              <dd style={{ margin: "4px 0 0", fontSize: 14, color: "var(--cm-text-strong)" }}>{value || "待补充"}</dd>
            </div>
          ))}
        </dl>
        <div style={{ marginTop: 20 }}>
          <Button disabled={loading || !conversationId || !canCompleteOnboarding(completeness)} onClick={complete}>
            确认并生成成长工作台
          </Button>
          {!canCompleteOnboarding(completeness) ? (
            <p style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5, color: "var(--cm-text-subtle)" }}>完整度达到 80% 后可以确认。</p>
          ) : null}
        </div>
      </SurfaceCard>
    </div>
  );
}
