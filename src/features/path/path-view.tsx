"use client";

/** 职业路径 —— 章节式版式：当前月任务、年度时间线、假设与风险 */
import { useState } from "react";
import { Lightbulb, AlertTriangle } from "lucide-react";
import { PlanSummaryCard } from "@/components/chat/plan-summary-card";
import { groupPlanTimeline } from "@/lib/path";
import { taskStatuses, taskStatusLabels, type CareerPlanDto, type PlanMonth, type TaskStatus, type AiExecutionMeta } from "@/lib/types";
import { fetchApi } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";

/* ── 主视图 ── */

interface PathViewProps {
  plan: CareerPlanDto | null;
  pendingPlan: CareerPlanDto | null;
  executionMeta: AiExecutionMeta | null;
  refresh: () => Promise<void>;
  setNotice: (v: string) => void;
}

export function PathView({ plan, pendingPlan, refresh, setNotice }: PathViewProps) {
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  async function generatePlan() {
    if (generating) return;
    setGenerating(true);
    setError("");
    setNotice("正在生成职业路径...");
    try {
      const r = await fetchApi<{ plan: CareerPlanDto; note: string }>("/api/plans/generate", {
        method: "POST",
        body: JSON.stringify({ regenerate: Boolean(plan) }),
      });
      if (!r.ok) throw new Error(r.error?.message ?? "职业路径生成失败");
      await refresh();
      setNotice(r.data.note || "职业路径已生成。");
    } catch (caught: any) {
      const m = caught.message ?? "职业路径生成失败，请稍后重试。";
      setError(m);
      setNotice(m);
    } finally {
      setGenerating(false);
    }
  }

  async function updateTask(taskId: string, status: TaskStatus) {
    if (!plan || busyTaskId) return;
    setBusyTaskId(taskId);
    setError("");
    setNotice("正在保存任务状态...");
    try {
      const r = await fetchApi<{ plan: CareerPlanDto; changed: boolean }>(
        `/api/plans/${encodeURIComponent(plan.id)}/tasks/${encodeURIComponent(taskId)}`,
        { method: "PATCH", body: JSON.stringify({ status }) },
      );
      if (!r.ok) throw new Error(r.error?.message ?? "任务状态保存失败");
      await refresh();
      setNotice(r.data.changed ? "任务状态已更新。" : "任务状态未变化。");
    } catch (caught: any) {
      const m = caught.message ?? "任务状态保存失败，请刷新后重试。";
      setError(m);
      setNotice(m);
    } finally {
      setBusyTaskId(null);
    }
  }

  async function acceptPendingPlan(planId: string) {
    setError("");
    setNotice("正在确认新计划版本...");
    const r = await fetchApi(`/api/plans/${encodeURIComponent(planId)}/decision`, {
      method: "POST",
      body: JSON.stringify({ action: "accept" }),
    });
    if (!r.ok) {
      const m = r.error?.message ?? "新计划确认失败，请稍后重试。";
      setError(m);
      setNotice(m);
      throw new Error(m);
    }
    await refresh();
    setNotice("新计划版本已确认，旧版本已保留。");
  }

  const timelinePlan = pendingPlan ?? plan;
  const timeline = timelinePlan ? groupPlanTimeline(timelinePlan) : [];
  const months = (plan?.months ?? []) as unknown as PlanMonth[];
  const currentMonth = months.find((m) => m.monthIndex === plan?.currentMonthIndex);

  return (
    <div className="path-layout" data-od-id="path-layout">
      {/* 页头：标题 + 主操作 */}
      <div className="path-head">
        <div>
          <span className="path-eyebrow">Career Path</span>
          <h2>职业路径</h2>
          <p className="path-head-desc">
            {plan
              ? `目标岗位：${plan.targetRoleLabel ?? plan.targetRole} · 当前执行版本 v${plan.version}`
              : "AI 会根据你的画像，生成一条可执行的成长路线。"}
          </p>
        </div>
        <Button disabled={generating} onClick={generatePlan}>
          {generating ? "生成中..." : plan ? "重规划" : "生成路径"}
        </Button>
      </div>

      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

      {/* 待确认的新版本 */}
      {pendingPlan ? (
        <div>
          <PlanSummaryCard plan={pendingPlan} onAcceptReplan={acceptPendingPlan} />
        </div>
      ) : null}

      {!plan ? (
        pendingPlan ? null : (
          <div className="path-empty">
            还没有职业路径。点击右上角「生成路径」，AI 会结合你的画像规划成长路线。
          </div>
        )
      ) : (
        <>
          {/* 当前月任务 */}
          {currentMonth ? (
            <section className="path-section">
              <div>
                <span className="path-eyebrow">当前月 · Month {currentMonth.monthIndex}</span>
                <h3 className="path-section-title">{currentMonth.goal}</h3>
              </div>
              <ul className="path-task-list">
                {currentMonth.learningTasks.map((task, ti) => (
                  <li key={task.id} className="path-task-row">
                    <div className="path-task-info">
                      <span className="path-task-index">{String(ti + 1).padStart(2, "0")}</span>
                      <span className="path-task-title">{task.title}</span>
                      <span className="path-task-meta">第 {task.dueWeek ?? "-"} 周前完成</span>
                    </div>
                    <select
                      className="cm-status-select"
                      aria-label={`更新 ${task.title} 状态`}
                      disabled={busyTaskId === task.id}
                      value={task.status}
                      onChange={(e) => { void updateTask(task.id, e.target.value as TaskStatus); }}
                    >
                      {taskStatuses.map((s) => <option key={s} value={s}>{taskStatusLabels[s]}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* 计划时间线 */}
          <section className="path-section">
            <div>
              <span className="path-eyebrow">Timeline</span>
              <h3 className="path-section-title">计划时间线</h3>
              <p className="path-section-sub">
                {pendingPlan
                  ? "以下为刚生成、待确认版本的时间线。"
                  : "按年展开，查看季度里程碑与月度目标。"}
              </p>
            </div>
            <div className="path-timeline">
              {timeline.map((section: any, index: number) => {
                const year = section.year as { yearIndex?: number; goal?: string };
                return (
                  <details key={year.yearIndex ?? index} open={index === 0} className="timeline-year">
                    <summary className="timeline-summary">
                      <span className="timeline-year-tag">第 {year.yearIndex ?? index + 1} 年</span>
                      <span>{year.goal ?? "年度目标"}</span>
                    </summary>
                    <div className="timeline-body">
                      <div className="quarter-grid">
                        {section.quarters.map((item: any, qi: number) => {
                          const q = item as { quarterIndex?: number; goal?: string; milestone?: string };
                          const quarterMonths = (section.months as unknown[]).slice(qi * 3, qi * 3 + 3) as PlanMonth[];
                          return (
                            <div key={q.quarterIndex ?? qi} className="quarter-block">
                              <div className="quarter-tag">Q{q.quarterIndex ?? qi + 1}</div>
                              {q.goal ? <div className="quarter-goal">{q.goal}</div> : null}
                              {q.milestone ? <p className="quarter-milestone">{q.milestone}</p> : null}
                              <ul className="quarter-months">
                                {quarterMonths.map((m, mi) => (
                                  <li key={m.monthIndex ?? `${qi}-${mi}`} className="quarter-month">
                                    <span className="month-tag">Month {m.monthIndex}</span>
                                    <span>{m.goal}</span>
                                  </li>
                                ))}
                                {quarterMonths.length === 0 ? (
                                  <li className="quarter-month empty">该季度暂无月度规划</li>
                                ) : null}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </section>

          {/* 假设与风险 */}
          <div className="path-notes">
            <div className="note-block">
              <h4><Lightbulb size={15} /> 计划假设</h4>
              <ul className="note-list">
                {plan.assumptions.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div className="note-block risk">
              <h4><AlertTriangle size={15} /> 风险提示</h4>
              <ul className="note-list">
                {plan.riskNotes.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
