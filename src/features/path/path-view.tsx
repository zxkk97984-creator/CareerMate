"use client";

/**
 * 职业路径：长期方向与近期执行分开。
 *
 * 阶段导航与任务主区保持两栏，详情按需打开；移动端阶段横向切换。
 * 任务数据只读 CareerPlanDto.tasks（V1/V2 共享）。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowRight, CalendarRange, Check, CheckCircle2, Clock3, History, Lightbulb, RotateCcw, Route } from "lucide-react";
import { LearningRouteDisplay } from "@/components/path/learning-route-view";
import { UnifiedTaskDetail } from "@/components/path/unified-task-detail";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { TaskDetailDrawer } from "./task-detail-drawer";
import "./path.css";
import { fetchApi } from "@/lib/client-api";
import {
  selectUnifiedNextTask,
  type PlanTaskSummary,
  type UnifiedPlanTask,
} from "@/lib/plans/task-model";
import {
  taskStatusLabels,
  taskStatuses,
  type AiExecutionMeta,
  type CareerPlanDto,
  type TaskStatus,
} from "@/lib/types";

interface PathViewProps {
  plan: CareerPlanDto | null;
  pendingPlan: CareerPlanDto | null;
  executionMeta: AiExecutionMeta | null;
  profileRoleLabel?: string | null;
  refresh: () => Promise<void>;
  setNotice: (v: string) => void;
}

interface PhaseGroup {
  id: string;
  title: string;
  objective: string;
  durationLabel: string;
  tasks: UnifiedPlanTask[];
}

interface LearningRouteState {
  content: unknown;
  relatedPlan: { id: string; targetRoleLabel: string | null; version: number; status: string } | null;
  basePlanVersion: number | number[] | null;
}

function phaseGroups(plan: CareerPlanDto | null, tasks: UnifiedPlanTask[]): PhaseGroup[] {
  if (!plan) return [];
  if (plan.v2) {
    const groups: PhaseGroup[] = plan.v2.phases.map((phase) => ({
      id: phase.id,
      title: phase.title,
      objective: phase.objective,
      durationLabel: `${phase.duration.value} ${phase.duration.unit === "day" ? "天" : phase.duration.unit === "week" ? "周" : phase.duration.unit === "month" ? "个月" : "年"}`,
      tasks: tasks.filter((task) => task.phaseId === phase.id),
    }));
    const immediateTasks = tasks.filter((task) => task.phaseId === "immediate");
    if (immediateTasks.length > 0) {
      groups.push({
        id: "immediate",
        title: "立即行动",
        objective: "先推进的近期行动",
        durationLabel: "本周",
        tasks: immediateTasks,
      });
    }
    return groups;
  }

  const groups = new Map<string, PhaseGroup>();
  for (const task of tasks) {
    const id = task.phaseId ?? "unassigned";
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        title: task.phaseTitle ?? "当前阶段",
        objective: "",
        durationLabel: "",
        tasks: [],
      });
    }
    groups.get(id)!.tasks.push(task);
  }
  return [...groups.values()];
}

function summaryFor(plan: CareerPlanDto | null): PlanTaskSummary | null {
  return plan?.taskSummary ?? null;
}

function TaskCard({
  task,
  index,
  busy,
  selected,
  onOpen,
  onStatusChange,
}: {
  task: UnifiedPlanTask;
  index: number;
  busy: boolean;
  selected: boolean;
  onOpen: () => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
}) {
  return (
    <article className={`path-task-card ${selected ? "selected" : ""}`} data-status={task.status}>
      <div className="path-task-card-head">
        <span className="path-task-number" aria-hidden="true">
          {task.status === "done" ? <Check size={15} /> : String(index + 1).padStart(2, "0")}
        </span>
        <h4>{task.title}</h4>
        <label className="path-task-card-status">
          <span className="sr-only">更新 {task.title} 状态</span>
          <select
            className="cm-status-select"
            disabled={busy}
            value={task.status}
            onChange={(event) => onStatusChange(task.id, event.target.value as TaskStatus)}
          >
            {taskStatuses.map((status) => (
              <option key={status} value={status}>{taskStatusLabels[status]}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="path-task-description">{task.description || "执行说明待补充，可与 AI 讨论细化。"}</p>
      <dl className="path-task-deliverables">
        <div><dt>任务产出</dt><dd>{task.outputs.join("、") || "产出待细化"}</dd></div>
        <div><dt>验收标准</dt><dd>{task.acceptanceCriteria.join("、") || "验收标准待细化"}</dd></div>
      </dl>
      <div className="path-task-card-footer">
        <div className="path-task-card-meta">
          <span><Clock3 size={14} />{task.estimatedHours != null ? `约 ${task.estimatedHours} 小时` : task.cadence ?? "投入待细化"}</span>
          {task.dueWeek != null ? <span><CalendarRange size={14} />第 {task.dueWeek} 周</span> : null}
        </div>
        <button type="button" className="path-task-open" onClick={onOpen} aria-label={`查看 ${task.title} 详情`} aria-haspopup="dialog">
          查看任务详情 <ArrowRight size={14} />
        </button>
      </div>
    </article>
  );
}

function PendingPlanPreview({
  active,
  pending,
  onAccept,
  onReject,
  busy,
}: {
  active: CareerPlanDto | null;
  pending: CareerPlanDto;
  onAccept: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const activeTasks = active?.tasks ?? [];
  const pendingTasks = pending.tasks ?? [];
  const activeById = new Map(activeTasks.map((task) => [task.id, task]));
  const pendingById = new Map(pendingTasks.map((task) => [task.id, task]));
  const added = pendingTasks.filter((task) => !activeById.has(task.id));
  const removed = activeTasks.filter((task) => !pendingById.has(task.id));
  const changed = pendingTasks.filter((task) => {
    const old = activeById.get(task.id);
    return old && (
      old.title !== task.title
      || old.description !== task.description
      || old.estimatedHours !== task.estimatedHours
      || old.dueWeek !== task.dueWeek
      || old.outputs.join("\u0000") !== task.outputs.join("\u0000")
      || old.acceptanceCriteria.join("\u0000") !== task.acceptanceCriteria.join("\u0000")
      || old.resources.join("\u0000") !== task.resources.join("\u0000")
    );
  });
  const budgetChange = active?.taskSummary?.plannedWeeklyHours !== pending.taskSummary?.plannedWeeklyHours;

  return (
    <section className="path-pending" data-od-id="path-pending-plan">
      <div className="path-pending-head">
        <div>
          <span className="path-eyebrow">待确认版本 v{pending.version}</span>
          <h3>完整预览后再决定</h3>
          <p>确认前不会替换当前执行计划。当前 v{active?.version ?? "-"} 会继续保留。</p>
        </div>
        <div className="path-pending-actions">
          <Button disabled={busy} onClick={onAccept}>接受新版本</Button>
          <Button variant="secondary" disabled={busy} onClick={onReject}>拒绝</Button>
          <Link className="path-adjust-link" href={`/chat?intent=adjust-plan&planId=${encodeURIComponent(pending.id)}`}>
            继续调整
          </Link>
        </div>
      </div>

      <div className="path-diff-grid">
        <div>
          <strong>新增 {added.length} 项</strong>
          {added.length > 0 ? <ul>{added.slice(0, 5).map((task) => <li key={task.id}>{task.title}</li>)}</ul> : <p>无</p>}
        </div>
        <div>
          <strong>删除 {removed.length} 项</strong>
          {removed.length > 0 ? <ul>{removed.slice(0, 5).map((task) => <li key={task.id}>{task.title}</li>)}</ul> : <p>无</p>}
        </div>
        <div>
          <strong>调整 {changed.length} 项</strong>
          {changed.length > 0 ? <ul>{changed.slice(0, 5).map((task) => <li key={task.id}>{task.title}</li>)}</ul> : <p>无</p>}
        </div>
        <div>
          <strong>预算变化</strong>
          <p>{budgetChange
            ? `每周投入 ${active?.taskSummary?.plannedWeeklyHours ?? "未知"} → ${pending.taskSummary?.plannedWeeklyHours ?? "未知"} 小时`
            : "本周预算不变或缺少可比投入"}</p>
        </div>
      </div>

      <details className="path-pending-full">
        <summary>查看完整计划（{pendingTasks.length} 项任务）</summary>
        <div className="path-pending-task-list">
          {pendingTasks.map((task) => (
            <div key={task.id}>
              <strong>{task.title}</strong>
              <span>{task.phaseTitle ?? "未分组"} · {task.estimatedHours != null ? `${task.estimatedHours} 小时` : task.cadence ?? "投入待细化"}</span>
              <p>{task.description || "待补充说明"}</p>
              <p>产出：{task.outputs.join("、") || "待补充"} · 验收：{task.acceptanceCriteria.join("、") || "待补充"}</p>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

export function PathView({
  plan,
  pendingPlan,
  executionMeta,
  profileRoleLabel,
  refresh,
  setNotice,
}: PathViewProps) {
  const searchParams = useSearchParams();
  const taskIdFromUrl = searchParams.get("taskId");
  const openedTaskParam = useRef<string | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [learningRoute, setLearningRoute] = useState<LearningRouteState | null>(null);
  const [versions, setVersions] = useState<CareerPlanDto[]>([]);
  const [showVersions, setShowVersions] = useState(false);

  const tasks = useMemo(() => plan?.tasks ?? [], [plan]);
  const groups = useMemo(() => phaseGroups(plan, tasks), [plan, tasks]);
  const nextTask = selectUnifiedNextTask(tasks);
  const currentPhaseId = plan?.taskSummary?.currentPhaseId ?? groups[0]?.id ?? null;
  const activePhaseId = selectedPhaseId ?? currentPhaseId;
  const activeGroup = groups.find((group) => group.id === activePhaseId) ?? groups[0] ?? null;
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const summary = summaryFor(plan);

  useEffect(() => {
    if (!taskIdFromUrl) {
      openedTaskParam.current = null;
      return;
    }
    if (openedTaskParam.current === taskIdFromUrl) return;
    const task = tasks.find((item) => item.id === taskIdFromUrl);
    if (!task) return;
    openedTaskParam.current = taskIdFromUrl;
    setSelectedTaskId(task.id);
    setSelectedPhaseId(task.phaseId ?? "unassigned");
  }, [taskIdFromUrl, tasks]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const response = await fetchApi<{ route: LearningRouteState | null }>("/api/learning-routes/current");
      if (active && response.ok && response.data.route) setLearningRoute(response.data.route);
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!showVersions || versions.length > 0) return;
    let active = true;
    void (async () => {
      const response = await fetchApi<{ items: CareerPlanDto[] }>("/api/plans/versions");
      if (active && response.ok) setVersions(response.data.items);
    })();
    return () => { active = false; };
  }, [showVersions, versions.length]);

  async function generatePlan() {
    if (generating) return;
    setGenerating(true);
    setError("");
    setNotice("正在生成新的职业路径预览...");
    try {
      const response = await fetchApi<{ plan: CareerPlanDto; note: string }>("/api/plans/generate", {
        method: "POST",
        body: JSON.stringify({ regenerate: Boolean(plan) }),
      });
      if (!response.ok) throw new Error(response.error?.message ?? "职业路径生成失败");
      await refresh();
      setNotice(response.data.note || "新计划已生成，请先预览再确认。");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "职业路径生成失败，请稍后重试。";
      setError(message);
      setNotice(message);
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
      const response = await fetchApi<{ plan: CareerPlanDto; changed: boolean }>(
        `/api/plans/${encodeURIComponent(plan.id)}/tasks/${encodeURIComponent(taskId)}`,
        { method: "PATCH", body: JSON.stringify({ status }) },
      );
      if (!response.ok) throw new Error(response.error?.message ?? "任务状态保存失败");
      await refresh();
      setNotice(response.data.changed ? "任务状态已更新。" : "任务状态未变化。");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "任务状态保存失败，请刷新后重试。";
      setError(message);
      setNotice(message);
    } finally {
      setBusyTaskId(null);
    }
  }

  async function decidePending(action: "accept" | "reject") {
    if (!pendingPlan || decisionBusy) return;
    setDecisionBusy(true);
    setError("");
    setNotice(action === "accept" ? "正在确认新计划版本..." : "正在拒绝新计划版本...");
    try {
      const response = await fetchApi(
        `/api/plans/${encodeURIComponent(pendingPlan.id)}/decision`,
        { method: "POST", body: JSON.stringify({ action }) },
      );
      if (!response.ok) throw new Error(response.error?.message ?? "计划决策失败");
      await refresh();
      setNotice(action === "accept" ? "新计划版本已确认，旧版本已保留。" : "已拒绝新计划版本，当前计划不变。");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "计划决策失败，请稍后重试。";
      setError(message);
      setNotice(message);
    } finally {
      setDecisionBusy(false);
    }
  }

  function openTask(task: UnifiedPlanTask) {
    setSelectedPhaseId(task.phaseId ?? "unassigned");
    setSelectedTaskId(task.id);
  }

  return (
    <div className="path-layout" data-od-id="path-layout">
      <section className="path-head">
        <div className="path-goal">
          <span className="path-goal-icon" aria-hidden="true"><Route size={22} /></span>
          <div>
            <span className="path-eyebrow">当前职业目标</span>
            <h2>{plan?.targetRoleLabel ?? profileRoleLabel ?? plan?.targetRole ?? "还没有职业路径"}</h2>
            <p className="path-head-desc">
              {plan
                ? summary?.currentPhaseTitle ?? "当前阶段"
                : "先生成一个可执行的计划，再从本周第一步开始。"}
            </p>
            {plan ? <div className="path-plan-meta">
              <span>执行版本 v{plan.version}</span>
              <span><Clock3 size={13} />每周预算 {summary?.weeklyBudgetHours != null ? `${summary.weeklyBudgetHours} 小时` : "待设置"}</span>
            </div> : null}
          </div>
        </div>
        <div className="path-head-side">
          <div className="path-head-actions">
            <Button variant="secondary" aria-expanded={showVersions} onClick={() => setShowVersions((value) => !value)}>
              <History size={15} /> {showVersions ? "收起历史版本" : "历史版本"}
            </Button>
            <Button variant={plan ? "secondary" : "primary"} className={!plan ? "path-generate" : undefined} loading={generating} disabled={generating} onClick={generatePlan}>
              {!generating ? <RotateCcw size={15} /> : null}
              {generating ? "生成中..." : plan ? "重规划" : "生成路径"}
            </Button>
          </div>
          {summary?.completionRate != null ? <div className="path-plan-progress">
            <div><span>计划进度 · {summary.done}/{summary.total} 已完成</span><strong>{summary.completionRate}%</strong></div>
            <progress aria-label="职业计划完成进度" value={summary.done} max={summary.total} />
          </div> : null}
        </div>
      </section>

      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

      {showVersions ? (
        <section className="path-versions" data-od-id="path-versions">
          <div className="path-section-head">
            <div>
              <span className="path-eyebrow">历史版本</span>
              <h3>只读查看，不参与当前执行</h3>
            </div>
          </div>
          {versions.length === 0 ? (
            <p className="path-empty-inline">还没有历史版本。</p>
          ) : (
            <ul>
              {versions.map((version) => (
                <li key={version.id}>
                  <div>
                    <strong>v{version.version} · {version.targetRoleLabel ?? version.targetRole}</strong>
                    <span>{new Date(version.updatedAt).toLocaleDateString("zh-CN")} · {version.status}</span>
                  </div>
                  <span>{version.taskSummary?.total ?? version.tasks?.length ?? 0} 项任务</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {pendingPlan ? (
        <PendingPlanPreview
          active={plan}
          pending={pendingPlan}
          busy={decisionBusy}
          onAccept={() => void decidePending("accept")}
          onReject={() => void decidePending("reject")}
        />
      ) : null}

      {!plan ? (
        <div className="path-empty">
          还没有职业路径。点击右上角「生成路径」，AI 会结合你的画像规划成长路线。
        </div>
      ) : (
        <>
          {nextTask ? (
            <section className="path-primary-action" data-od-id="path-primary-action">
              <div>
                <span className="path-eyebrow">本周优先推进</span>
                <h3>{nextTask.title}</h3>
                <p>{nextTask.description || "打开任务详情，补充或确认执行说明。"}</p>
                <div className="path-primary-meta">
                  <span><Clock3 size={13} />{nextTask.estimatedHours != null ? `${nextTask.estimatedHours} 小时` : nextTask.cadence ?? "投入待细化"}</span>
                  <span><CheckCircle2 size={13} />{nextTask.outputs.join("、") || "产出待细化"}</span>
                </div>
              </div>
              <button type="button" onClick={() => openTask(nextTask)} aria-haspopup="dialog">
                查看任务 <ArrowRight size={15} />
              </button>
            </section>
          ) : null}

          <div className="path-workspace">
            <div className="path-stage-rail">
              <div className="path-stage-rail-head"><h3>成长阶段</h3><span>{groups.length} 个阶段</span></div>
              <nav className="path-stage-nav" aria-label="计划阶段">
                {groups.map((group, index) => {
                  const groupDone = group.tasks.filter((task) => task.status === "done").length;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      className={group.id === activeGroup?.id ? "active" : ""}
                      aria-current={group.id === activeGroup?.id ? "step" : undefined}
                      onClick={() => setSelectedPhaseId(group.id)}
                    >
                      <span className="path-stage-index">{String(index + 1).padStart(2, "0")}</span>
                      <span>
                        <strong>{group.title}</strong>
                        <small>{group.durationLabel ? `${group.durationLabel} · ` : ""}{groupDone}/{group.tasks.length} 完成</small>
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <section className="path-stage-main" data-od-id="path-stage-main">
              {activeGroup ? (
                <>
                  <div className="path-section-head">
                    <div>
                      <span className="path-eyebrow">阶段 {String(groups.indexOf(activeGroup) + 1).padStart(2, "0")} · 阶段目标</span>
                      <h3>{activeGroup.title}</h3>
                      {activeGroup.objective ? <p>{activeGroup.objective}</p> : null}
                    </div>
                    <span className="path-stage-count">{activeGroup.tasks.length} 项任务</span>
                  </div>
                  <div className="path-task-cards">
                    {activeGroup.tasks.length === 0 ? <p className="path-empty-inline">这个阶段暂无任务，可与 AI 讨论下一步安排。</p> : null}
                    {activeGroup.tasks.map((task, index) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        index={index}
                        busy={busyTaskId !== null}
                        selected={selectedTaskId === task.id}
                        onOpen={() => openTask(task)}
                        onStatusChange={(id, status) => void updateTask(id, status)}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <p className="path-empty-inline">当前计划没有可读取的任务，请重新生成并预览。</p>
              )}
            </section>
          </div>

          {selectedTask ? (
            <TaskDetailDrawer onClose={() => setSelectedTaskId(null)}>
              <UnifiedTaskDetail
                task={selectedTask}
                planId={plan.id}
                busy={busyTaskId !== null}
                onStatusChange={(id, status) => void updateTask(id, status)}
              />
            </TaskDetailDrawer>
          ) : null}

          <section className="path-section">
            <div className="path-section-head">
              <div>
                <span className="path-eyebrow">学习安排</span>
                <h3>已确认的学习路线</h3>
              </div>
            </div>
            {learningRoute ? (
              <LearningRouteDisplay
                content={learningRoute.content}
                relatedPlan={learningRoute.relatedPlan}
                basePlanVersion={learningRoute.basePlanVersion}
              />
            ) : (
              <p className="path-empty-inline">暂无已确认的学习路线，可让 AI 基于当前计划生成。</p>
            )}
          </section>

          <div className="path-notes">
            <div className="note-block">
              <h4><Lightbulb size={15} /> 计划假设</h4>
              <ul className="note-list">
                {(plan.assumptions.length > 0 ? plan.assumptions : ["计划基于当前画像与时间预算生成。"]).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div className="note-block risk">
              <h4><AlertTriangle size={15} /> 风险提示</h4>
              <ul className="note-list">
                {(plan.riskNotes.length > 0 ? plan.riskNotes : ["连续两周无法推进时，应降低任务密度并重新安排。"]).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
        </>
      )}
      {executionMeta ? (
        <p className="path-execution-meta" data-mode={executionMeta.actualMode}>
          {executionMeta.actualMode === "api" ? "计划来源：百宝箱 API" : `计划来源：${executionMeta.actualMode}`}
          {executionMeta.degraded ? "（已降级）" : ""}
        </p>
      ) : null}
    </div>
  );
}
