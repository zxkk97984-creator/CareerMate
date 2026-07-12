"use client";

/** 成长概览 —— 指标卡、能力雷达、本月任务、近期记录 */
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { abilityKeys, abilityLabels, type PlanMonth } from "@/lib/types";
import type { WorkspaceData } from "@/lib/workspace-types";
import { fetchApi } from "@/lib/client-api";

/* ── 局部工具（后续 Task 迁移到 UI 组件） ── */

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Btn({ children, onClick, disabled, variant = "primary" }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: "primary" | "secondary" | "danger" }) {
  const cls = variant === "danger" ? "bg-rose-600 text-white hover:bg-rose-700" : variant === "secondary" ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50" : "bg-slate-950 text-white hover:bg-slate-800";
  return <button disabled={disabled} onClick={onClick} className={`h-10 rounded-md px-4 text-sm font-semibold ${cls}`}>{children}</button>;
}

function Metric({ title, value, tone }: { title: string; value: string; tone: "indigo" | "emerald" | "amber" }) {
  const m = { indigo: "bg-indigo-50 text-indigo-700", emerald: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700" };
  return <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">{title}</div><div className={`mt-3 inline-flex rounded-md px-3 py-2 text-2xl font-semibold ${m[tone]}`}>{value}</div></div>;
}

/* ── 主视图 ── */

interface DashboardViewProps { data: WorkspaceData; refresh: () => Promise<void>; setNotice: (v: string) => void; }

export function DashboardView({ data, refresh, setNotice }: DashboardViewProps) {
  const radar = abilityKeys.map((k) => ({ ability: abilityLabels[k], score: data.profile?.abilityScores[k] ?? 0 }));
  const currentMonth = (data.plan?.months?.[Math.max((data.plan?.currentMonthIndex ?? 1) - 1, 0)] ?? null) as PlanMonth | null;

  async function generatePlan() { setNotice("正在生成 3 年路径..."); await fetchApi("/api/plans/generate", { method: "POST" }); setNotice("3 年路径已生成，当前月任务已刷新。"); await refresh(); }

  return (<>
    <div className="grid gap-4 md:grid-cols-3">
      <Metric title="加权岗位匹配度" value={`${data.match?.score ?? 0}%`} tone="indigo" />
      <Metric title="本月任务" value={`${currentMonth?.learningTasks?.length ?? 0} 项`} tone="emerald" />
      <Metric title="待确认画像" value={`${data.candidates.filter((c: any) => c.status === "pending").length} 条`} tone="amber" />
    </div>
    <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
      <Panel title="能力雷达图" action={<Btn variant="secondary" onClick={generatePlan}>重生成路径</Btn>}>
        <div className="h-80"><ResponsiveContainer width="100%" height="100%"><RadarChart data={radar}><PolarGrid /><PolarAngleAxis dataKey="ability" tick={{ fontSize: 12 }} /><Radar dataKey="score" stroke="#2563eb" fill="#2563eb" fillOpacity={0.22} /></RadarChart></ResponsiveContainer></div>
      </Panel>
      <Panel title="当前月重点"><div className="space-y-4"><div><div className="text-sm font-medium text-slate-500">目标</div><div className="mt-1 text-lg font-semibold text-slate-950">{currentMonth?.goal ?? "还没有生成职业路径"}</div></div><div className="grid gap-3">{(currentMonth?.learningTasks ?? []).map((t: any) => (<div key={t.id} className="flex items-center justify-between rounded-md border border-slate-200 px-4 py-3"><div><div className="text-sm font-semibold text-slate-900">{t.title}</div><div className="text-xs text-slate-500">第 {t.dueWeek ?? "-"} 周前完成</div></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{t.status}</span></div>))}</div></div></Panel>
    </div>
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="匹配度说明"><p className="text-sm leading-6 text-slate-600">{data.match?.explanation ?? "完成画像后将生成岗位匹配度说明。"}</p><div className="mt-4 flex flex-wrap gap-2">{(data.match?.weakAbilities ?? []).map((a: any) => (<span key={a} className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700">优先提升：{abilityLabels[a as keyof typeof abilityLabels]}</span>))}</div></Panel>
      <Panel title="近期成长记录"><div className="space-y-3">{data.recentProgressLogs.length === 0 ? <p className="text-sm text-slate-500">还没有成长记录。</p> : data.recentProgressLogs.map((log: any) => (<div key={log.id} className="rounded-md border border-slate-200 px-4 py-3"><div className="flex items-center justify-between gap-3"><div className="text-sm font-semibold text-slate-900">{log.title}</div><time className="text-xs text-slate-400" dateTime={log.createdAt}>{new Date(log.createdAt).toLocaleDateString("zh-CN")}</time></div>{log.summary ? <p className="mt-1 text-xs leading-5 text-slate-500">{log.summary}</p> : null}</div>))}</div></Panel>
    </div>
  </>);
}
