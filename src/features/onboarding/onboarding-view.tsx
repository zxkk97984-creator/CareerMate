"use client";

/** 对话式画像引导 —— 多轮对话 + 画像摘要 + 确认生成工作台 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { canCompleteOnboarding, type OnboardingDraft } from "@/lib/onboarding";
import { createOnboardingInitialState, type ActiveOnboardingConversation } from "@/lib/onboarding-resume";
import type { AiRuntimeSnapshot } from "@/lib/ai-runtime";
import type { OnboardingMessage } from "@/lib/workspace-types";
import { fetchApi } from "@/lib/client-api";

/* ── 局部工具 ── */

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="rounded-lg border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="text-base font-semibold text-slate-950">{title}</h2>{action}</div><div className="p-5">{children}</div></section>;
}

function Btn({ children, onClick, disabled, variant = "primary" }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: "primary" | "secondary" | "danger" }) {
  const cls = variant === "danger" ? "bg-rose-600 text-white hover:bg-rose-700" : variant === "secondary" ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50" : "bg-slate-950 text-white hover:bg-slate-800";
  return <button disabled={disabled} onClick={onClick} className={`h-10 rounded-md px-4 text-sm font-semibold ${cls}`}>{children}</button>;
}

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
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
      <Panel title="对话式画像引导">
        <div className="mb-4"><div className="flex items-center justify-between text-sm"><span className="font-medium text-slate-700">画像完整度</span><span className="font-semibold text-slate-950">{Math.round(completeness * 100)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600 transition-[width]" style={{ width: `${Math.round(completeness * 100)}%` }} /></div></div>
        <div className="max-h-[430px] space-y-3 overflow-y-auto rounded-lg bg-slate-50 p-4">{messages.map((item, i) => (<div key={`${item.role}-${i}`} className={`max-w-[88%] rounded-lg px-4 py-3 text-sm leading-6 ${item.role === "user" ? "ml-auto bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{item.content}</div>))}</div>
        <textarea className="mt-4 min-h-24 w-full rounded-md border border-slate-200 p-3 text-sm leading-6" placeholder="一次可以告诉我多项信息，例如：我是大三统计学专业，想做数据分析，每周有 8 小时……" value={message} onChange={(e) => setMessage(e.target.value)} />
        {error ? <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <div className="mt-4 flex items-center gap-3"><Btn disabled={loading || !message.trim()} onClick={send}>{loading ? "处理中..." : "发送"}</Btn><span className="text-xs text-slate-500">确认前不会改写正式画像</span></div>
      </Panel>
      <Panel title="画像摘要">
        <dl className="space-y-3">{summary.map(([label, value]) => (<div key={label} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2"><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-900">{value || "待补充"}</dd></div>))}</dl>
        <div className="mt-5"><Btn disabled={loading || !conversationId || !canCompleteOnboarding(completeness)} onClick={complete}>确认并生成成长工作台</Btn>{!canCompleteOnboarding(completeness) ? <p className="mt-2 text-xs leading-5 text-slate-500">完整度达到 80% 后可以确认。</p> : null}</div>
      </Panel>
    </div>
  );
}
