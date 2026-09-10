"use client";

import { useRef, useState } from "react";
import { ArrowRight, Check, CheckCircle2, Clock3, Flag, ListTodo, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchApi } from "@/lib/client-api";
import type { DashboardDto } from "@/lib/dashboard/model";
import type { UnifiedPlanTask } from "@/lib/plans/task-model";
import { taskStatusLabels, type TaskStatus } from "@/lib/types";
import "./dashboard.css";

interface DashboardViewProps {
  dashboard: DashboardDto | null;
  loading?: boolean;
  error?: string;
  refresh: () => Promise<void>;
  setNotice: (message: string) => void;
}

function TaskStatusBadge({ task }: { task: UnifiedPlanTask }) {
  return <span className={`growth-status growth-status-${task.status}`}>{taskStatusLabels[task.status]}</span>;
}

function TaskDetails({ task }: { task: UnifiedPlanTask }) {
  return (
    <details className="growth-task-details" key={task.id}>
      <summary>查看产出与验收标准</summary>
      <dl>
        {task.description && <div><dt>做什么</dt><dd>{task.description}</dd></div>}
        <div><dt>产出什么</dt><dd>{task.outputs.length ? task.outputs.join("、") : "待补充明确交付物，可在职业路径中查看。"}</dd></div>
        <div><dt>怎样验收</dt><dd>{task.acceptanceCriteria.length ? task.acceptanceCriteria.join("、") : "待补充验收标准，可在职业路径中查看。"}</dd></div>
      </dl>
    </details>
  );
}

export function DashboardView({ dashboard, loading, error, refresh, setNotice }: DashboardViewProps) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const actionHeadingRef = useRef<HTMLHeadingElement>(null);
  const [feedback, setFeedback] = useState<{ message: string; failed: boolean } | null>(null);

  function report(message: string, failed = false) {
    setFeedback({ message, failed });
    setNotice(message);
  }

  async function mutate(status?: TaskStatus) {
    if (!dashboard || busyRef.current || error) return;
    const task = dashboard.action.task;
    if (status && (!task || !dashboard.planId)) return;
    busyRef.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const response = status
        ? await fetchApi(`/api/plans/${encodeURIComponent(dashboard.planId!)}/tasks/${encodeURIComponent(task!.id)}`, { method: "PATCH", body: JSON.stringify({ status }) })
        : await fetchApi("/api/plans/generate", { method: "POST" });
      if (!response.ok) {
        if (response.status === 409) await refresh();
        report(response.error.message, true);
        return;
      }
      await refresh();
      actionHeadingRef.current?.focus();
      report(status === "done" ? `已完成「${task!.title}」。` : status ? `已开始「${task!.title}」。` : "已提交计划生成请求，请在职业路径查看进度与预览。");
    } catch {
      report("请求未能完成，请刷新确认最新状态后重试。", true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (!dashboard) {
    return <section className="growth-panel growth-empty" aria-busy={Boolean(loading)}>
      <ListTodo size={24} aria-hidden="true" />
      <h2>{loading ? "正在整理你的成长进度" : "成长概览暂时未能加载"}</h2>
      <p>{loading ? "正在读取目标、任务与最近成果。" : error ?? "请重试加载，继续推进你的计划。"}</p>
      {!loading && <Button variant="secondary" onClick={() => void refresh()}>重新加载</Button>}
    </section>;
  }

  const { progress, action } = dashboard;
  const task = action.task;
  return (
    <div className="growth-dashboard">
      <section className="growth-goal" aria-labelledby="growth-goal-title">
        <div className="growth-goal-heading">
          <span className="growth-icon"><Target size={20} aria-hidden="true" /></span>
          <div><span className="growth-eyebrow">我的职业目标</span><h2 id="growth-goal-title">{dashboard.targetRole ?? "先找到你的成长方向"}</h2>
            <p>{progress.currentPhaseTitle ?? (progress.total > 0 && progress.done === progress.total ? "本期任务已完成，可以复盘新的方向。" : "从一份适合自己的计划开始。")}</p>
          </div>
        </div>
        <div className="growth-progress">
          <div className="growth-progress-caption"><span>计划进度</span><strong>{progress.completionRate === null ? "待建立" : `${progress.completionRate}%`}</strong></div>
          {progress.completionRate !== null && <progress aria-label="计划完成进度" value={progress.done} max={progress.total} />}
          <p>{progress.total > 0 ? <><b>{progress.done}</b> / {progress.total} 项已完成<span> · {progress.inProgress} 项进行中</span></> : "有可执行任务后，这里会显示真实进度。"}</p>
        </div>
        <a className="growth-link" href="/path">查看路径 <ArrowRight size={15} aria-hidden="true" /></a>
      </section>

      {feedback && <div className={`growth-feedback ${feedback.failed ? "is-error" : ""}`} role={feedback.failed ? "alert" : "status"}>{feedback.message}</div>}
      {error && <div className="growth-feedback is-error" role="alert">当前展示的是上次加载的数据。请使用上方“重试”更新后再操作。</div>}

      <div className="growth-grid">
        <section className="growth-panel growth-action" aria-labelledby="growth-action-title" data-od-id="dashboard-next-action">
          <header className="growth-section-heading"><span className="growth-eyebrow">当前行动</span>{task && <TaskStatusBadge task={task} />}</header>
          <h2 id="growth-action-title" tabIndex={-1} ref={actionHeadingRef}>{action.title}</h2>
          <p>{action.reason}</p>
          {task && <div className="growth-task-meta"><Clock3 size={15} aria-hidden="true" />{task.estimatedHours === null ? "预计投入待细化" : `预计 ${task.estimatedHours} 小时`}{task.phaseTitle && <span>{task.phaseTitle}</span>}</div>}
          {task && <TaskDetails task={task} />}
          <div className="growth-actions">
            {action.kind === "task" && task ? <>
              {task.status !== "in_progress" && <Button className="growth-primary" disabled={busy || Boolean(error)} loading={busy} onClick={() => void mutate("in_progress")}>开始任务 <ArrowRight size={16} aria-hidden="true" /></Button>}
              <Button className={task.status === "in_progress" ? "growth-primary" : ""} variant={task.status === "in_progress" ? "primary" : "secondary"} disabled={busy || Boolean(error)} loading={busy && task.status === "in_progress"} onClick={() => void mutate("done")}><Check size={16} aria-hidden="true" />标记完成</Button>
              <a className="growth-link" href={action.href!}>进入任务详情 <ArrowRight size={15} aria-hidden="true" /></a>
            </> : action.kind === "generate" ? <Button className="growth-primary" disabled={busy || Boolean(error)} loading={busy} onClick={() => void mutate()}>{busy ? "正在提交…" : action.label}</Button> : <a className="growth-primary growth-button-link" href={action.href!}>{action.label} <ArrowRight size={16} aria-hidden="true" /></a>}
          </div>
        </section>

        <section className="growth-panel growth-tasks" aria-labelledby="growth-tasks-title">
          <header className="growth-section-heading"><h2 id="growth-tasks-title">近期安排</h2><a className="growth-link" href="/path">全部任务 <ArrowRight size={14} aria-hidden="true" /></a></header>
          <p className="growth-section-description">按计划顺序与任务状态推荐，不代表自然周排期。</p>
          {dashboard.recentTasks.length ? <ul className="growth-task-list">{dashboard.recentTasks.map((item, index) => <li key={item.id}>
            <span className="growth-task-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <a href={`/path?taskId=${encodeURIComponent(item.id)}`}><strong>{item.title}</strong><span>{item.estimatedHours === null ? "投入待细化" : `约 ${item.estimatedHours} 小时`}{item.dueWeek !== null ? ` · 计划第 ${item.dueWeek} 周` : ""}</span></a>
            <TaskStatusBadge task={item} />
          </li>)}</ul> : <p className="growth-empty-copy">{progress.total > 0 ? "当前任务已完成。查看路径，回顾成果并规划下一阶段。" : "还没有可安排的任务。生成并确认计划后，从这里开始。"}</p>}
          <footer className="growth-budget"><Clock3 size={15} aria-hidden="true" /><div><strong>{progress.weeklyBudgetHours === null ? "每周可用时间尚未设置" : `每周可用 ${progress.weeklyBudgetHours} 小时`}</strong><p>{progress.budgetMessage}</p></div></footer>
        </section>

        <section className="growth-panel growth-attention" aria-labelledby="growth-attention-title">
          <header className="growth-section-heading"><h2 id="growth-attention-title">待处理事项</h2><Flag size={17} aria-hidden="true" /></header>
          {dashboard.attention.length ? <ul>{dashboard.attention.map((item) => <li key={item.id} className={`growth-attention-${item.tone}`}><h3>{item.title}</h3><p>{item.description}</p><a className="growth-link" href={item.href}>{item.label} <ArrowRight size={14} aria-hidden="true" /></a></li>)}</ul> : <div className="growth-clear"><CheckCircle2 size={22} aria-hidden="true" /><h3>暂时没有待处理事项</h3><p>专注当前任务，按自己的节奏推进。</p></div>}
        </section>

        <section className="growth-panel growth-evidence" aria-labelledby="growth-evidence-title">
          <header className="growth-section-heading"><h2 id="growth-evidence-title">最近完成</h2><span className="growth-eyebrow">每一步都有迹可循</span></header>
          {dashboard.evidence.length ? <ol className="growth-evidence-list">{dashboard.evidence.map((item) => <li key={item.id}><CheckCircle2 size={17} aria-hidden="true" /><div><h3>{item.title}</h3><p>{item.summary}</p><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", month: "short", day: "numeric", year: "numeric" })}</time></div></li>)}</ol> : <p className="growth-empty-copy">完成第一个任务或训练后，你的成长成果会出现在这里。</p>}
        </section>

        <section className="growth-panel growth-abilities" aria-labelledby="growth-abilities-title">
          <header className="growth-section-heading"><h2 id="growth-abilities-title">能力与成长</h2><a className="growth-link" href="/memory?tab=profile">查看依据</a></header>
          <div className="growth-score"><span>成长参考分</span><div><strong>{dashboard.match?.score ?? "待评估"}</strong>{dashboard.match?.score != null && <span> / 100</span>}</div><p>{dashboard.match?.explanation ?? "积累能力证据后，这里会显示成长参考分。"}</p></div>
          <ul className="growth-ability-list">{dashboard.abilities.map((ability) => <li key={ability.key}><div><span>{ability.label}</span><strong>{ability.score ?? "待评估"}</strong></div>{ability.score !== null && <progress aria-label={ability.label} value={ability.score} max={100} />}</li>)}</ul>
          <p className="growth-footnote">只展示已有记录的能力；参考分用于安排学习，不代表岗位胜任概率。</p>
        </section>
      </div>
    </div>
  );
}
