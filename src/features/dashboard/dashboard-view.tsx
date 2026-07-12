"use client";

/** 成长概览 —— 指标卡、能力雷达、本月任务、近期记录 */
import { useState } from "react";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { abilityKeys, abilityLabels, type PlanMonth } from "@/lib/types";
import type { WorkspaceData } from "@/lib/workspace-types";
import { fetchApi } from "@/lib/client-api";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Button } from "@/components/ui/button";

/* ── 指标卡片 ── */

function Metric({ title, value, tone }: { title: string; value: string; tone: "brand" | "success" | "warning" }) {
  const m: Record<string, string> = {
    brand: "var(--cm-surface-soft)", success: "var(--cm-success-bg)", warning: "var(--cm-warning-bg)",
  };
  const c: Record<string, string> = {
    brand: "var(--cm-brand)", success: "var(--cm-success)", warning: "var(--cm-warning)",
  };
  return (
    <div style={{ borderRadius: "var(--cm-radius-card)", border: "1px solid var(--cm-border)", background: "var(--cm-surface)", padding: 20, boxShadow: "var(--cm-shadow-card)" }}>
      <div style={{ fontSize: 14, color: "var(--cm-text-muted)" }}>{title}</div>
      <div style={{ marginTop: 12, display: "inline-flex", borderRadius: "var(--cm-radius-sm)", padding: "8px 12px", fontSize: 24, fontWeight: 600, background: m[tone], color: c[tone] }}>{value}</div>
    </div>
  );
}

/* ── 主视图 ── */

interface DashboardViewProps { data: WorkspaceData; refresh: () => Promise<void>; setNotice: (v: string) => void; }

export function DashboardView({ data, refresh, setNotice }: DashboardViewProps) {
  const radar = abilityKeys.map((k) => ({ ability: abilityLabels[k], score: data.profile?.abilityScores[k] ?? 0 }));
  const currentMonth = (data.plan?.months?.[Math.max((data.plan?.currentMonthIndex ?? 1) - 1, 0)] ?? null) as PlanMonth | null;
  const [generating, setGenerating] = useState(false);

  async function generatePlan() {
    if (generating) return;
    setGenerating(true);
    setNotice("正在生成 3 年路径...");
    try {
      const r = await fetchApi("/api/plans/generate", { method: "POST" });
      if (!r.ok) {
        setNotice(r.error?.message ?? "路径生成失败，请稍后重试。");
        return;
      }
      setNotice("3 年路径已生成，当前月任务已刷新。");
      await refresh();
    } catch {
      setNotice("网络异常，路径生成失败，请检查网络后重试。");
    } finally {
      setGenerating(false);
    }
  }

  return (<>
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(3, 1fr)" }} className="max-md:grid-cols-1">
      <Metric title="加权岗位匹配度" value={`${data.match?.score ?? 0}%`} tone="brand" />
      <Metric title="本月任务" value={`${currentMonth?.learningTasks?.length ?? 0} 项`} tone="success" />
      <Metric title="待确认画像" value={`${data.candidates.filter((c: any) => c.status === "pending").length} 条`} tone="warning" />
    </div>
    <div style={{ display: "grid", gap: 20, gridTemplateColumns: "420px 1fr" }} className="max-lg:grid-cols-1">
      <SurfaceCard title="能力雷达图" action={<Button variant="secondary" disabled={generating} onClick={generatePlan}>{generating ? "生成中..." : "重生成路径"}</Button>}>
        <div style={{ height: 320 }}><ResponsiveContainer width="100%" height="100%"><RadarChart data={radar}><PolarGrid /><PolarAngleAxis dataKey="ability" tick={{ fontSize: 12 }} /><Radar dataKey="score" stroke="var(--cm-brand)" fill="var(--cm-brand)" fillOpacity={0.22} /></RadarChart></ResponsiveContainer></div>
      </SurfaceCard>
      <SurfaceCard title="当前月重点">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--cm-text-muted)" }}>目标</div>
            <div style={{ marginTop: 4, fontSize: 18, fontWeight: 600, color: "var(--cm-text-strong)" }}>{currentMonth?.goal ?? "还没有生成职业路径"}</div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {(currentMonth?.learningTasks ?? []).map((t: any) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: "var(--cm-radius-sm)", border: "1px solid var(--cm-border)", padding: "12px 16px" }}>
                <div><div style={{ fontSize: 14, fontWeight: 600, color: "var(--cm-text-strong)" }}>{t.title}</div><div style={{ fontSize: 12, color: "var(--cm-text-subtle)" }}>第 {t.dueWeek ?? "-"} 周前完成</div></div>
                <span style={{ borderRadius: 999, background: "var(--cm-canvas)", padding: "4px 12px", fontSize: 12, color: "var(--cm-text-muted)" }}>{t.status}</span>
              </div>
            ))}
          </div>
        </div>
      </SurfaceCard>
    </div>
    <div style={{ display: "grid", gap: 20, gridTemplateColumns: "1fr 1fr" }} className="max-lg:grid-cols-1">
      <SurfaceCard title="匹配度说明">
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--cm-text-muted)" }}>{data.match?.explanation ?? "完成画像后将生成岗位匹配度说明。"}</p>
        <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(data.match?.weakAbilities ?? []).map((a: any) => (
            <span key={a} style={{ borderRadius: 999, background: "var(--cm-warning-bg)", padding: "4px 12px", fontSize: 12, color: "var(--cm-warning)" }}>优先提升：{abilityLabels[a as keyof typeof abilityLabels]}</span>
          ))}
        </div>
      </SurfaceCard>
      <SurfaceCard title="近期成长记录">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data.recentProgressLogs.length === 0 ? <p style={{ fontSize: 14, color: "var(--cm-text-muted)" }}>还没有成长记录。</p> : data.recentProgressLogs.map((log: any) => (
            <div key={log.id} style={{ borderRadius: "var(--cm-radius-sm)", border: "1px solid var(--cm-border)", padding: "12px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--cm-text-strong)" }}>{log.title}</div>
                <time style={{ fontSize: 12, color: "var(--cm-text-subtle)" }} dateTime={log.createdAt}>{new Date(log.createdAt).toLocaleDateString("zh-CN")}</time>
              </div>
              {log.summary ? <p style={{ marginTop: 4, fontSize: 12, lineHeight: 1.5, color: "var(--cm-text-muted)" }}>{log.summary}</p> : null}
            </div>
          ))}
        </div>
      </SurfaceCard>
    </div>
  </>);
}
