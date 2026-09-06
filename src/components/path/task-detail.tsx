"use client";

import { buildTaskDetail, taskStatusLabel, type TaskDetailView } from "@/lib/task-detail";
import type { PlanMonth, TaskStatus } from "@/lib/types";

interface TaskDetailPanelProps {
  taskId: string;
  title: string;
  taskType?: string;
  status: TaskStatus;
  dueWeek?: number;
  estimatedHours?: number | null;
  month: PlanMonth | null;
  busy?: boolean;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
}

/**
 * 任务详情（桌面右侧抽屉 / 手机全屏）：只读现有字段，缺失项明确“待细化”。
 * months 级交付物/完成标准标“本阶段共同要求”，不归属到单任务（plan 4.3 / T14a）。
 */
export function TaskDetailPanel({ taskId, title, taskType = "practice", status, dueWeek, estimatedHours, month, busy, onStatusChange }: TaskDetailPanelProps) {
  const detail = buildTaskDetail({
    task: { id: taskId, title, type: taskType, status, dueWeek, estimatedHours },
    month,
  });

  return (
    <div className="task-detail-panel" data-testid="task-detail" role="region" aria-label={`${title} 任务详情`}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--cm-text-strong)" }}>{detail.title}</h3>
      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span className="cm-dot-tag cm-dot-tag-neutral">{detail.typeLabel}</span>
        <span className="cm-dot-tag cm-dot-tag-neutral">{taskStatusLabel(detail.status)}</span>
        {detail.weekLabel && <span className="cm-dot-tag cm-dot-tag-neutral">{detail.weekLabel}</span>}
      </div>

      <dl style={{ margin: "16px 0 0", display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <dt style={{ fontSize: 12.5, fontWeight: 500, color: "var(--cm-text-subtle)" }}>预计投入</dt>
          <dd style={{ margin: "2px 0 0", fontSize: 14, color: "var(--cm-text-strong)" }}>{detail.estimatedHours ?? "让 AI 细化"}</dd>
        </div>
        <div>
          <dt style={{ fontSize: 12.5, fontWeight: 500, color: "var(--cm-text-subtle)" }}>步骤</dt>
          <dd style={{ margin: "2px 0 0", fontSize: 14, color: "var(--cm-text-strong)" }}>{detail.steps ? detail.steps.join("、") : "让 AI 细化"}</dd>
        </div>
        <div>
          <dt style={{ fontSize: 12.5, fontWeight: 500, color: "var(--cm-text-subtle)" }}>
            交付物{detail.sharedByMonth ? "（本阶段共同要求）" : ""}
          </dt>
          <dd style={{ margin: "2px 0 0", fontSize: 14, color: "var(--cm-text-strong)" }}>
            {detail.deliverables?.length ? detail.deliverables.join("、") : "让 AI 细化"}
          </dd>
        </div>
        <div>
          <dt style={{ fontSize: 12.5, fontWeight: 500, color: "var(--cm-text-subtle)" }}>
            完成标准{detail.sharedByMonth ? "（本阶段共同要求）" : ""}
          </dt>
          <dd style={{ margin: "2px 0 0", fontSize: 14, color: "var(--cm-text-strong)" }}>
            {detail.completionCriteria?.length ? detail.completionCriteria.join("、") : "让 AI 细化"}
          </dd>
        </div>
      </dl>

      {onStatusChange ? (
        <div style={{ marginTop: 18 }}>
          <label style={{ fontSize: 12.5, fontWeight: 500, color: "var(--cm-text-subtle)" }}>任务状态</label>
          <select
            className="cm-status-select"
            aria-label={`更新 ${title} 状态`}
            disabled={busy}
            value={detail.status}
            onChange={(e) => onStatusChange(taskId, e.target.value as TaskStatus)}
            style={{ display: "block", marginTop: 6, minHeight: 44 }}
          >
            <option value="not_started">未开始</option>
            <option value="in_progress">进行中</option>
            <option value="done">已完成</option>
            <option value="delayed">已延期</option>
          </select>
        </div>
      ) : null}
    </div>
  );
}

export type { TaskDetailView };
