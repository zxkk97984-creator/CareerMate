"use client";

/** 职业路径 —— 3 年计划、当前月任务、可展开时间线、重规划确认 */
import { useState } from "react";
import { PlanSummaryCard } from "@/components/chat/plan-summary-card";
import { formatAiRuntimeDescription } from "@/lib/ai-runtime";
import { groupPlanTimeline } from "@/lib/path";
import { taskStatuses, type CareerPlanDto, type PlanMonth, type TaskStatus, type AiExecutionMeta } from "@/lib/types";
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

interface PathViewProps { plan: CareerPlanDto | null; pendingPlan: CareerPlanDto | null; executionMeta: AiExecutionMeta | null; refresh: () => Promise<void>; setNotice: (v: string) => void; }

export function PathView({ plan, pendingPlan, executionMeta, refresh, setNotice }: PathViewProps) {
  const triggerLabel = plan?.generationMeta?.triggeredBy === "chat" ? "对话生成" : plan?.generationMeta?.triggeredBy === "auto" ? "自动生成" : "手动生成";
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  async function generatePlan() { if (generating) return; setGenerating(true); setError(""); setNotice("正在生成 36 个月行动计划..."); try { const r = await fetchApi<{ plan: CareerPlanDto; note: string }>("/api/plans/generate", { method: "POST", body: JSON.stringify({ regenerate: Boolean(plan) }) }); if (!r.ok) throw new Error(r.error?.message ?? "职业路径生成失败"); await refresh(); setNotice(r.data.note || "职业路径已生成。"); } catch (caught: any) { const m = caught.message ?? "职业路径生成失败，请稍后重试。"; setError(m); setNotice(m); } finally { setGenerating(false); } }
  async function updateTask(taskId: string, status: TaskStatus) { if (!plan || busyTaskId) return; setBusyTaskId(taskId); setError(""); setNotice("正在保存任务状态..."); try { const r = await fetchApi<{ plan: CareerPlanDto; changed: boolean }>(`/api/plans/${encodeURIComponent(plan.id)}/tasks/${encodeURIComponent(taskId)}`, { method: "PATCH", body: JSON.stringify({ status }) }); if (!r.ok) throw new Error(r.error?.message ?? "任务状态保存失败"); await refresh(); setNotice(r.data.changed ? "任务状态已更新。" : "任务状态未变化。"); } catch (caught: any) { const m = caught.message ?? "任务状态保存失败，请刷新后重试。"; setError(m); setNotice(m); } finally { setBusyTaskId(null); } }
  async function acceptPendingPlan(planId: string) { setError(""); setNotice("正在确认新计划版本..."); const r = await fetchApi(`/api/plans/${encodeURIComponent(planId)}/accept-replan`, { method: "POST" }); if (!r.ok) { const m = r.error?.message ?? "新计划确认失败，请稍后重试。"; setError(m); setNotice(m); throw new Error(m); } await refresh(); setNotice("新计划版本已确认，旧版本已保留。"); }

  const timeline = plan ? groupPlanTimeline(plan) : [];
  const months = (plan?.months ?? []) as unknown as PlanMonth[];
  const currentMonth = months.find((m) => m.monthIndex === plan?.currentMonthIndex);

  return (
    <Panel title="3 年职业路径" action={<Btn disabled={generating} onClick={generatePlan}>{generating ? "生成中..." : plan ? "重规划" : "生成路径"}</Btn>}>
      {error ? <p className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {pendingPlan ? <div className="mb-5"><PlanSummaryCard plan={pendingPlan} onAcceptReplan={acceptPendingPlan} /></div> : null}
      {!plan ? (pendingPlan ? null : <div className="rounded-md bg-slate-50 p-5 text-sm text-slate-600">还没有职业路径，请先生成。</div>) : (
        <div className="space-y-5">
          {executionMeta ? <div className={`rounded-md px-4 py-3 text-sm ${executionMeta.degraded ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>AI 执行：{formatAiRuntimeDescription(executionMeta)} · 来源：{triggerLabel}{executionMeta.fallbackReason ? ` · 原因：${executionMeta.fallbackReason}` : ""}</div> : null}
          {currentMonth ? (
            <section className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4"><h3 className="font-semibold text-slate-950">当前月任务 · Month {currentMonth.monthIndex}</h3><div className="mt-3 space-y-3">{currentMonth.learningTasks.map((task) => (<div key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-white px-4 py-3"><div><div className="text-sm font-semibold text-slate-900">{task.title}</div><div className="text-xs text-slate-500">第 {task.dueWeek ?? "-"} 周前完成</div></div><select aria-label={`更新 ${task.title} 状态`} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm" disabled={busyTaskId === task.id} value={task.status} onChange={(e) => { void updateTask(task.id, e.target.value as TaskStatus); }}>{taskStatuses.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>))}</div></section>
          ) : null}
          <div className="space-y-3">{timeline.map((section: any, index: number) => { const year = section.year as { yearIndex?: number; goal?: string }; return (<details key={year.yearIndex ?? index} open={index === 0} className="rounded-lg border border-slate-200 bg-white"><summary className="cursor-pointer px-4 py-4 font-semibold text-slate-950">第 {year.yearIndex ?? index + 1} 年 · {year.goal ?? "年度目标"}</summary><div className="space-y-4 border-t border-slate-100 p-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{section.quarters.map((item: any, qi: number) => { const q = item as { quarterIndex?: number; goal?: string; milestone?: string }; return (<div key={q.quarterIndex ?? qi} className="rounded-md border border-slate-200 p-3"><div className="text-xs font-medium text-slate-500">Q{q.quarterIndex ?? qi + 1}</div><div className="mt-1 text-sm font-semibold text-slate-900">{q.goal}</div>{q.milestone ? <p className="mt-2 text-xs leading-5 text-slate-500">{q.milestone}</p> : null}</div>); })}</div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{section.months.map((item: any, mi: number) => { const m = item as unknown as PlanMonth; return (<div key={m.monthIndex ?? mi} className="rounded-md border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-medium text-slate-500">Month {m.monthIndex}</div><div className="mt-1 text-sm font-semibold text-slate-900">{m.goal}</div></div>); })}</div></div></details>); })}</div>
          <div className="grid gap-4 md:grid-cols-2"><section className="rounded-lg border border-slate-200 p-4"><h3 className="font-semibold text-slate-950">计划假设</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">{plan.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></section><section className="rounded-lg border border-amber-200 bg-amber-50/40 p-4"><h3 className="font-semibold text-slate-950">风险提示</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">{plan.riskNotes.map((item) => <li key={item}>{item}</li>)}</ul></section></div>
        </div>
      )}
    </Panel>
  );
}
