"use client";

/** 职业路径 —— 3 年计划、当前月任务、可展开时间线、重规划确认 */
import { useState } from "react";
import { PlanSummaryCard } from "@/components/chat/plan-summary-card";
import { formatAiRuntimeDescription } from "@/lib/ai-runtime";
import { groupPlanTimeline } from "@/lib/path";
import { taskStatuses, type CareerPlanDto, type PlanMonth, type TaskStatus, type AiExecutionMeta } from "@/lib/types";
import { fetchApi } from "@/lib/client-api";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";

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
    <SurfaceCard title="3 年职业路径" action={<Button disabled={generating} onClick={generatePlan}>{generating ? "生成中..." : plan ? "重规划" : "生成路径"}</Button>}>
      {error ? <div style={{ marginBottom: 16 }}><InlineAlert tone="error">{error}</InlineAlert></div> : null}
      {pendingPlan ? <div style={{ marginBottom: 20 }}><PlanSummaryCard plan={pendingPlan} onAcceptReplan={acceptPendingPlan} /></div> : null}
      {!plan ? (pendingPlan ? null : <div style={{ borderRadius: "var(--cm-radius-sm)", background: "var(--cm-canvas)", padding: 20, fontSize: 14, color: "var(--cm-text-muted)" }}>还没有职业路径，请先生成。</div>) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {executionMeta ? (
            <div style={{ borderRadius: "var(--cm-radius-sm)", padding: "12px 16px", fontSize: 14, background: executionMeta.degraded ? "var(--cm-warning-bg)" : "var(--cm-success-bg)", color: executionMeta.degraded ? "var(--cm-warning)" : "var(--cm-success)" }}>
              AI 执行：{formatAiRuntimeDescription(executionMeta)} · 来源：{triggerLabel}{executionMeta.fallbackReason ? ` · 原因：${executionMeta.fallbackReason}` : ""}
            </div>
          ) : null}
          {currentMonth ? (
            <section style={{ borderRadius: "var(--cm-radius-card)", border: "1px solid var(--cm-border-strong)", background: "var(--cm-surface-soft)", padding: 16 }}>
              <h3 style={{ fontWeight: 600, color: "var(--cm-text-strong)", margin: 0 }}>当前月任务 · Month {currentMonth.monthIndex}</h3>
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                {currentMonth.learningTasks.map((task) => (
                  <div key={task.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, borderRadius: "var(--cm-radius-sm)", background: "var(--cm-surface)", padding: "12px 16px" }}>
                    <div><div style={{ fontSize: 14, fontWeight: 600, color: "var(--cm-text-strong)" }}>{task.title}</div><div style={{ fontSize: 12, color: "var(--cm-text-subtle)" }}>第 {task.dueWeek ?? "-"} 周前完成</div></div>
                    <select aria-label={`更新 ${task.title} 状态`} style={{ height: 36, borderRadius: "var(--cm-radius-sm)", border: "1px solid var(--cm-border-strong)", background: "var(--cm-surface)", padding: "0 12px", fontSize: 14, color: "var(--cm-text-strong)" }} disabled={busyTaskId === task.id} value={task.status} onChange={(e) => { void updateTask(task.id, e.target.value as TaskStatus); }}>{taskStatuses.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {timeline.map((section: any, index: number) => {
              const year = section.year as { yearIndex?: number; goal?: string };
              return (
                <details key={year.yearIndex ?? index} open={index === 0} style={{ borderRadius: "var(--cm-radius-card)", border: "1px solid var(--cm-border)", background: "var(--cm-surface)" }}>
                  <summary style={{ cursor: "pointer", padding: "16px", fontWeight: 600, color: "var(--cm-text-strong)" }}>第 {year.yearIndex ?? index + 1} 年 · {year.goal ?? "年度目标"}</summary>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16, borderTop: "1px solid var(--cm-border)", padding: 16 }}>
                    <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(4,1fr)" }} className="max-md:grid-cols-2">
                      {section.quarters.map((item: any, qi: number) => {
                        const q = item as { quarterIndex?: number; goal?: string; milestone?: string };
                        return (<div key={q.quarterIndex ?? qi} style={{ borderRadius: "var(--cm-radius-sm)", border: "1px solid var(--cm-border)", padding: 12 }}><div style={{ fontSize: 12, fontWeight: 500, color: "var(--cm-text-subtle)" }}>Q{q.quarterIndex ?? qi + 1}</div><div style={{ marginTop: 4, fontSize: 14, fontWeight: 600, color: "var(--cm-text-strong)" }}>{q.goal}</div>{q.milestone ? <p style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5, color: "var(--cm-text-muted)" }}>{q.milestone}</p> : null}</div>);
                      })}
                    </div>
                    <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(3,1fr)" }} className="max-md:grid-cols-2">
                      {section.months.map((item: any, mi: number) => {
                        const m = item as unknown as PlanMonth;
                        return (<div key={m.monthIndex ?? mi} style={{ borderRadius: "var(--cm-radius-sm)", border: "1px solid var(--cm-border)", background: "var(--cm-canvas)", padding: 12 }}><div style={{ fontSize: 12, fontWeight: 500, color: "var(--cm-text-subtle)" }}>Month {m.monthIndex}</div><div style={{ marginTop: 4, fontSize: 14, fontWeight: 600, color: "var(--cm-text-strong)" }}>{m.goal}</div></div>);
                      })}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }} className="max-md:grid-cols-1">
            <section style={{ borderRadius: "var(--cm-radius-card)", border: "1px solid var(--cm-border)", padding: 16 }}><h3 style={{ fontWeight: 600, color: "var(--cm-text-strong)", margin: 0 }}>计划假设</h3><ul style={{ marginTop: 12, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8, fontSize: 14, color: "var(--cm-text-muted)" }}>{plan.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></section>
            <section style={{ borderRadius: "var(--cm-radius-card)", border: "1px solid rgba(184,138,30,0.3)", background: "var(--cm-warning-bg)", padding: 16 }}><h3 style={{ fontWeight: 600, color: "var(--cm-text-strong)", margin: 0 }}>风险提示</h3><ul style={{ marginTop: 12, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8, fontSize: 14, color: "var(--cm-text-muted)" }}>{plan.riskNotes.map((item) => <li key={item}>{item}</li>)}</ul></section>
          </div>
        </div>
      )}
    </SurfaceCard>
  );
}
