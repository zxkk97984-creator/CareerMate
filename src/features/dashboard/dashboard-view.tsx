"use client";

/** 成长概览 —— 不对称网格：匹配度大卡 / 指标卡 / 能力雷达 / 本月任务 / 说明与记录 */
import { useState } from "react";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { abilityKeys, abilityLabels, taskStatusLabels, type PlanMonth, type TaskStatus } from "@/lib/types";
import type { WorkspaceData } from "@/lib/workspace-types";
import { fetchApi } from "@/lib/client-api";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Button } from "@/components/ui/button";

/* ── 指标卡 ── */

function Metric({ title, value, unit, tone }: { title: string; value: string; unit?: string; tone: "brand" | "success" | "warning" | "danger" }) {
  const dot: Record<string, string> = {
    brand: "var(--cm-brand)", success: "var(--cm-success)", warning: "var(--cm-warning)", danger: "var(--cm-danger)",
  };
  return (
    <div className="cm-metric-card" style={{ padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500, color: "var(--cm-text-muted)" }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: dot[tone] }} aria-hidden="true" />
        {title}
      </div>
      <div style={{ marginTop: 14, display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="cm-mono" style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--cm-text-strong)" }}>{value}</span>
        {unit ? <span style={{ fontSize: 13, color: "var(--cm-text-subtle)" }}>{unit}</span> : null}
      </div>
    </div>
  );
}

/* ── 主视图 ── */

const statusTone: Record<string, { bg: string; color: string }> = {
  not_started: { bg: "var(--cm-surface-soft)", color: "var(--cm-text-muted)" },
  in_progress: { bg: "var(--cm-info-bg)", color: "var(--cm-info)" },
  done: { bg: "var(--cm-success-bg)", color: "var(--cm-success)" },
  completed: { bg: "var(--cm-success-bg)", color: "var(--cm-success)" },
  delayed: { bg: "var(--cm-danger-bg)", color: "var(--cm-danger)" },
};

const statusProgress: Record<string, string> = {
  not_started: "15%",
  in_progress: "60%",
  done: "100%",
  completed: "100%",
  delayed: "40%",
};

const statusBarColor: Record<string, string> = {
  not_started: "var(--cm-surface-sunken)",
  in_progress: "var(--cm-info)",
  done: "var(--cm-success)",
  completed: "var(--cm-success)",
  delayed: "var(--cm-danger)",
};

interface DashboardViewProps { data: WorkspaceData; refresh: () => Promise<void>; setNotice: (v: string) => void; }

export function DashboardView({ data, refresh, setNotice }: DashboardViewProps) {
  const radar = abilityKeys.map((k) => ({ ability: abilityLabels[k], score: data.profile?.abilityScores[k] ?? 0 }));
  const currentMonth = (data.plan?.months?.[Math.max((data.plan?.currentMonthIndex ?? 1) - 1, 0)] ?? null) as PlanMonth | null;
  const [generating, setGenerating] = useState(false);

  async function generatePlan() {
    if (generating) return;
    setGenerating(true);
    setNotice("正在生成职业路径...");
    try {
      const r = await fetchApi("/api/plans/generate", { method: "POST" });
      if (!r.ok) {
        setNotice(r.error?.message ?? "路径生成失败，请稍后重试。");
        return;
      }
      setNotice("职业路径已生成，当前月任务已刷新。");
      await refresh();
    } catch {
      setNotice("网络异常，路径生成失败，请检查网络后重试。");
    } finally {
      setGenerating(false);
    }
  }

  const pendingCandidateCount =
    data.candidates.filter((c: any) => c.status === "pending").length +
    (data.v2Candidates ?? []).length;

  return (
    <>
      {/* 第一行：左侧大号岗位匹配度卡片 + 右侧两个小指标卡 */}
      <div className="dash-row-1" data-od-id="dashboard-row-match">
        <section className="cm-match-card" style={{ gridColumn: "span 1" }}>
          <div style={{ position: "relative", zIndex: 1 }}>
            <span className="cm-eyebrow" style={{ marginBottom: 10 }}>岗位匹配度 · MATCH</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span className="cm-match-number">{data.match?.score ?? 0}<span style={{ fontSize: 26, color: "var(--cm-text-subtle)" }}>%</span></span>
            </div>
            <p style={{ margin: "14px 0 0", fontSize: 13.5, lineHeight: 1.7, color: "var(--cm-text-muted)", maxWidth: 460 }}>
              当前能力画像与目标岗位
              <strong style={{ color: "var(--cm-text-strong)" }}>{data.profile?.targetRoleLabel ?? "（未设置）"}</strong>
              的加权匹配度。能力越接近岗位要求，评分越高。
            </p>
          </div>
          {(data.match?.weakAbilities?.length ?? 0) > 0 && (
            <div style={{ position: "relative", zIndex: 1, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--cm-text-subtle)" }}>优先提升：</span>
              {(data.match?.weakAbilities ?? []).map((a: any) => (
                <span key={a} className="cm-dot-tag cm-dot-tag-warning">
                  {abilityLabels[a as keyof typeof abilityLabels]}
                </span>
              ))}
            </div>
          )}
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Metric title="本月任务" value={`${currentMonth?.learningTasks?.length ?? 0}`} unit="项" tone="brand" />
          <Metric title="待确认画像" value={`${pendingCandidateCount}`} unit="条" tone="warning" />
        </div>
      </div>

      {/* 第二行：左侧能力雷达图 + 右侧当前月重点任务 */}
      <div className="dash-row-2" data-od-id="dashboard-row-charts">
        <SurfaceCard title="能力雷达图" description="主色为当前能力值" action={<Button variant="secondary" disabled={generating} onClick={generatePlan}>{generating ? "生成中..." : "重生成路径"}</Button>}>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radar} outerRadius="72%">
                <PolarGrid stroke="var(--cm-accent)" strokeOpacity={0.35} />
                <PolarAngleAxis dataKey="ability" tick={{ fontSize: 12, fill: "var(--cm-text-muted)" }} />
                <Radar dataKey="score" name="当前能力" stroke="var(--cm-brand)" strokeWidth={2} fill="var(--cm-brand)" fillOpacity={0.18} label={{ fontSize: 12, fill: "var(--cm-text-muted)" }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </SurfaceCard>

        <SurfaceCard title="当前月重点">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--cm-text-subtle)" }}>本月目标</div>
              <div style={{ marginTop: 4, fontSize: 16, fontWeight: 600, lineHeight: 1.5, color: "var(--cm-text-strong)" }}>
                {currentMonth?.goal ?? "还没有生成职业路径"}
              </div>
            </div>
            <div style={{ display: "grid", gap: 4 }}>
              {(currentMonth?.learningTasks ?? []).map((t: any) => {
                const tone = statusTone[t.status] ?? { bg: "var(--cm-canvas)", color: "var(--cm-text-muted)" };
                return (
                  <div key={t.id} className="cm-task-row">
                    <div className="cm-task-main">
                      <div className="cm-task-title">{t.title}</div>
                      <div className="cm-task-meta">第 {t.dueWeek ?? "-"} 周前完成</div>
                    </div>
                    <span className="cm-task-status" style={{ background: tone.bg, color: tone.color }}>
                      {taskStatusLabels[t.status as TaskStatus] ?? t.status}
                    </span>
                    <div className="cm-task-track">
                      <span
                        className="cm-task-bar"
                        style={{ width: statusProgress[t.status] ?? "15%", background: statusBarColor[t.status] ?? "var(--cm-surface-sunken)" }}
                      />
                    </div>
                  </div>
                );
              })}
              {(currentMonth?.learningTasks?.length ?? 0) === 0 && (
                <p style={{ margin: 0, fontSize: 13.5, color: "var(--cm-text-muted)" }}>暂无任务，先生成职业路径。</p>
              )}
            </div>
          </div>
        </SurfaceCard>
      </div>

      {/* 第三行：匹配度说明 + 近期成长记录（简洁列表） */}
      <div className="dash-row-3" data-od-id="dashboard-row-notes">
        <SurfaceCard title="匹配度说明">
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.75, color: "var(--cm-text-muted)" }}>
            {data.match?.explanation ?? "完成画像后将生成岗位匹配度说明。"}
          </p>
        </SurfaceCard>

        <SurfaceCard title="近期成长记录">
          {data.recentProgressLogs.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--cm-text-muted)" }}>还没有成长记录，完成第一个任务后这里会出现。</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {data.recentProgressLogs.map((log: any, i: number) => (
                <li key={log.id} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "11px 4px", borderTop: i > 0 ? "1px solid var(--cm-border)" : "none" }}>
                  <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--cm-brand)", flexShrink: 0, transform: "translateY(-2px)" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--cm-text-strong)" }}>{log.title}</div>
                    {log.summary ? (
                      <div style={{ marginTop: 2, fontSize: 12.5, lineHeight: 1.55, color: "var(--cm-text-muted)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{log.summary}</div>
                    ) : null}
                  </div>
                  <time style={{ fontSize: 12, color: "var(--cm-text-subtle)", whiteSpace: "nowrap" }} dateTime={log.createdAt}>
                    {new Date(log.createdAt).toLocaleDateString("zh-CN")}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>
      </div>
    </>
  );
}
