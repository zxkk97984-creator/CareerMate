"use client";

/** 成长概览 —— 不对称网格：匹配度大卡 / 指标卡 / 能力雷达 / 本月任务 / 说明与记录 */
import { useState } from "react";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { abilityKeys, abilityLabels, taskStatusLabels, type PlanMonth, type TaskStatus } from "@/lib/types";
import type { WorkspaceData } from "@/lib/workspace-types";
import { fetchApi } from "@/lib/client-api";
import { selectNextAction } from "@/lib/next-action";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/lib/motion/count-up";
import { Reveal } from "@/components/ui/reveal";

/* ── 指标卡 ── */

function Metric({ title, value, unit, tone }: { title: string; value: number; unit?: string; tone: "brand" | "success" | "warning" | "danger" }) {
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
        <CountUp
          className="cm-mono"
          style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--cm-text-strong)" }}
          value={value}
        />
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

interface DashboardViewProps { data: WorkspaceData; refresh: () => Promise<void>; setNotice: (v: string) => void; }

export function DashboardView({ data, refresh, setNotice }: DashboardViewProps) {
  const radar = abilityKeys.map((k) => ({ ability: abilityLabels[k], score: data.profile?.abilityScores[k] ?? 0 }));
  const currentMonth = (data.plan?.months?.[Math.max((data.plan?.currentMonthIndex ?? 1) - 1, 0)] ?? null) as PlanMonth | null;
  const [generating, setGenerating] = useState(false);

  // 真实完成进度（F06/T11）：completed/total，不再用基于 status 的虚构百分比
  const currentTasks = (currentMonth?.learningTasks ?? []) as Array<{ id: string; title: string; type: string; status: TaskStatus; dueWeek?: number }>;
  const totalTasks = currentTasks.length;
  const doneTasks = currentTasks.filter((t) => t.status === "done").length;

  // 确定性“下一步”（plan 3.3）：画像→引导 / pending→审阅 / 无计划→生成 / 进行中→继续 / 延期→查看 / 未开始→第一项 / 全完成→复盘
  const nextAction = selectNextAction({
    profileCompleted: Boolean(data.profile?.onboardingCompleted),
    plan: data.plan ? { id: data.plan.id } : null,
    pendingPlan: data.pendingPlan ? { id: data.pendingPlan.id } : null,
    tasks: currentTasks.map((t, i) => ({ id: t.id, title: t.title, status: t.status, dueWeek: t.dueWeek, order: i })),
    hasCompleted: doneTasks > 0,
  });

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
      // /api/plans/generate 创建的是 pending 候选，不是立即生效的正式计划（F05）
      setNotice("新计划已准备好，确认后开始执行。");
      await refresh();
    } catch {
      setNotice("网络异常，路径生成失败，请检查网络后重试。");
    } finally {
      setGenerating(false);
    }
  }

  const pendingCandidateCount =
    data.candidates.filter((c: any) => c.status === "pending").length +
    (data.v2Candidates ?? []).length +
    (data.pendingPlan ? 1 : 0); // pending 计划同样计入待确认，保持概览/路径/建议中心计数一致

  return (
    <>
      {/* 下一步主区：行动优先（plan 3.3 / T11）——状态短标签 → 任务标题 → 推荐原因 → 一个主按钮 */}
      <section className="dash-next-action" data-od-id="dashboard-next-action" style={{ borderRadius: "var(--cm-radius-card)", border: "1px solid var(--cm-border)", background: "var(--cm-surface)", boxShadow: "var(--cm-shadow-card)", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--cm-brand-ink, #0E76FF)" }}>下一步</span>
          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 600, lineHeight: 1.4, color: "var(--cm-text-strong)" }}>{nextAction.title}</div>
          <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--cm-text-muted)" }}>{nextAction.reason}</p>
        </div>
        <a
          href={nextAction.href}
          style={{ flexShrink: 0, minHeight: 44, padding: "0 18px", display: "inline-flex", alignItems: "center", borderRadius: "var(--cm-radius-control)", background: "var(--cm-brand, #0E76FF)", color: "#fff", textDecoration: "none", fontWeight: 600 }}
        >
          {nextAction.actionLabel}
        </a>
      </section>

      {/* 待确认计划横条：生成的是候选，确认前不改当前任务（F05/T09） */}
      {data.pendingPlan ? (
        <section data-od-id="dashboard-pending-plan" style={{ borderRadius: "var(--cm-radius-card)", border: "1px solid var(--cm-border)", background: "var(--cm-surface)", boxShadow: "var(--cm-shadow-card)", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <strong style={{ fontSize: 14, color: "var(--cm-text-strong)" }}>新计划待确认</strong>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--cm-text-muted)" }}>
              新计划已准备好，确认后开始执行；当前任务保持不变。
            </p>
          </div>
          <a href="/path" style={{ flexShrink: 0, minHeight: 44, padding: "0 16px", display: "inline-flex", alignItems: "center", borderRadius: "var(--cm-radius-control)", background: "var(--cm-brand, #0E76FF)", color: "#fff", textDecoration: "none", fontWeight: 600 }}>
            审阅计划
          </a>
        </section>
      ) : null}

      {/* 第一行：左侧大号岗位匹配度卡片 + 右侧两个小指标卡 */}
      <div className="dash-row-1" data-od-id="dashboard-row-match">
        <section className="cm-match-card" style={{ gridColumn: "span 1" }}>
          <div style={{ position: "relative", zIndex: 1 }}>
            <span className="cm-eyebrow" style={{ marginBottom: 10 }}>成长参考分 · GROWTH SCORE</span>
            {data.match?.score != null ? (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  <CountUp className="cm-match-number" value={data.match.score} />
                  <span style={{ fontSize: 26, color: "var(--cm-text-subtle)" }}>/ 100</span>
                </div>
                <p style={{ margin: "14px 0 0", fontSize: 13.5, lineHeight: 1.7, color: "var(--cm-text-muted)", maxWidth: 460 }}>
                  {data.match.explanation}
                </p>
              </>
            ) : (
              <>
                <div style={{ marginTop: 6, fontSize: 18, fontWeight: 600, color: "var(--cm-text-muted)" }}>信息不足</div>
                <p style={{ margin: "14px 0 0", fontSize: 13.5, lineHeight: 1.7, color: "var(--cm-text-muted)", maxWidth: 460 }}>
                  {data.match?.explanation ?? "完成画像并记录能力后，这里会给出成长参考分（用于学习安排参考，不表示胜任概率）。"}
                </p>
              </>
            )}
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
          <Metric title="本月任务" value={totalTasks} unit="项" tone="brand" />
          <Metric title="待确认画像" value={pendingCandidateCount} unit="条" tone="warning" />
        </div>
      </div>

      {/* 第二行：左侧能力雷达图 + 右侧当前月重点任务 */}
      <div className="dash-row-2" data-od-id="dashboard-row-charts">
        <Reveal variant="card">
          <SurfaceCard title="能力雷达图" description="主色为当前能力值" action={<Button variant="secondary" disabled={generating} onClick={generatePlan}>{generating ? "生成中..." : "重生成路径"}</Button>}>
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radar} outerRadius="72%">
                  <PolarGrid stroke="var(--cm-accent)" strokeOpacity={0.35} />
                  <PolarAngleAxis dataKey="ability" tick={{ fontSize: 12, fill: "var(--cm-text-muted)" }} />
                  <Radar
                    dataKey="score"
                    name="当前能力"
                    stroke="var(--cm-brand)"
                    strokeWidth={2}
                    fill="var(--cm-brand)"
                    fillOpacity={0.18}
                    animationDuration={600}
                    label={{ fontSize: 12, fill: "var(--cm-text-muted)" }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </SurfaceCard>
        </Reveal>

        <Reveal variant="card" delay={0.08}>
          <SurfaceCard title="当前月重点">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--cm-text-subtle)" }}>本月目标</div>
                <div style={{ marginTop: 4, fontSize: 16, fontWeight: 600, lineHeight: 1.5, color: "var(--cm-text-strong)" }}>
                  {currentMonth?.goal ?? "还没有生成职业路径"}
                </div>
              </div>
              {/* 真实进度：已完成/总数（不虚构百分比） */}
              {totalTasks > 0 && (
                <div style={{ fontSize: 12.5, color: "var(--cm-text-subtle)" }}>
                  本期已完成 {doneTasks}/{totalTasks}
                </div>
              )}
              <div style={{ display: "grid", gap: 4 }}>
                {currentTasks.map((t) => {
                  const tone = statusTone[t.status] ?? { bg: "var(--cm-canvas)", color: "var(--cm-text-muted)" };
                  return (
                    <a
                      key={t.id}
                      href={`/path#task-${t.id}`}
                      className="cm-task-row"
                      style={{ textDecoration: "none", cursor: "pointer", minHeight: 44, alignItems: "center" }}
                    >
                      <div className="cm-task-main">
                        <div className="cm-task-title" style={{ color: "var(--cm-text-strong)" }}>{t.title}</div>
                        <div className="cm-task-meta">第 {t.dueWeek ?? "-"} 周前完成</div>
                      </div>
                      <span className="cm-task-status" style={{ background: tone.bg, color: tone.color }}>
                        {taskStatusLabels[t.status] ?? t.status}
                      </span>
                    </a>
                  );
                })}
                {totalTasks === 0 && (
                  <p style={{ margin: 0, fontSize: 13.5, color: "var(--cm-text-muted)" }}>暂无任务，先生成职业路径。</p>
                )}
              </div>
            </div>
          </SurfaceCard>
        </Reveal>
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
