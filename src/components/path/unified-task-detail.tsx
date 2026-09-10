"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { taskStatusLabels, taskStatuses, type TaskStatus } from "@/lib/types";
import type { UnifiedPlanTask } from "@/lib/plans/task-model";
import { displayTaskResourceReference } from "@/lib/resources";

interface UnifiedTaskDetailProps {
  task: UnifiedPlanTask;
  planId?: string | null;
  busy?: boolean;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt style={{ fontSize: 12.5, fontWeight: 500, color: "var(--cm-text-subtle)" }}>{label}</dt>
      <dd style={{ margin: "3px 0 0", fontSize: 14, lineHeight: 1.7, color: "var(--cm-text-strong)" }}>{children}</dd>
    </div>
  );
}

export function UnifiedTaskDetail({
  task,
  planId,
  busy,
  onStatusChange,
}: UnifiedTaskDetailProps) {
  return (
    <div data-testid="unified-task-detail" role="region" aria-label={`${task.title} 任务详情`}>
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 650, lineHeight: 1.5, color: "var(--cm-text-strong)" }}>
        {task.title}
      </h3>
      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span className="cm-dot-tag cm-dot-tag-neutral">{task.phaseTitle ?? "当前阶段"}</span>
        <span className="cm-dot-tag cm-dot-tag-neutral">{taskStatusLabels[task.status]}</span>
        {task.dueWeek != null ? <span className="cm-dot-tag cm-dot-tag-neutral">第 {task.dueWeek} 周</span> : null}
      </div>

      <dl style={{ margin: "18px 0 0", display: "flex", flexDirection: "column", gap: 14 }}>
        <DetailRow label="做什么">
          {task.description || <span style={{ color: "var(--cm-warning)" }}>待补充可执行说明</span>}
        </DetailRow>
        <DetailRow label="预计投入">
          {task.estimatedHours != null
            ? `${task.estimatedHours} 小时`
            : task.cadence || <span style={{ color: "var(--cm-warning)" }}>待补充投入或节奏</span>}
        </DetailRow>
        <DetailRow label="产出什么">
          {task.outputs.length > 0
            ? task.outputs.join("、")
            : <span style={{ color: "var(--cm-warning)" }}>待补充明确交付物</span>}
        </DetailRow>
        <DetailRow label="怎样验收">
          {task.acceptanceCriteria.length > 0
            ? task.acceptanceCriteria.join("、")
            : <span style={{ color: "var(--cm-warning)" }}>待补充验收标准</span>}
        </DetailRow>
        {task.resources.length > 0 ? (
          <DetailRow label="关联材料">{task.resources.map(displayTaskResourceReference).join("、")}</DetailRow>
        ) : null}
      </dl>

      {planId ? (
        <Link
          href={`/resources?taskId=${encodeURIComponent(task.id)}&planId=${encodeURIComponent(planId)}`}
          style={{
            marginTop: 18,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            minHeight: 40,
            padding: "0 14px",
            borderRadius: "var(--cm-radius-control)",
            border: "1px solid var(--cm-border-strong)",
            background: "var(--cm-surface)",
            color: "var(--cm-text-strong)",
            fontSize: 13.5,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          <ExternalLink size={14} /> 查找相关学习资源
        </Link>
      ) : null}

      {onStatusChange ? (
        <div style={{ marginTop: 20 }}>
          <label style={{ fontSize: 12.5, fontWeight: 500, color: "var(--cm-text-subtle)" }} htmlFor={`task-status-${task.id}`}>
            任务状态
          </label>
          <select
            id={`task-status-${task.id}`}
            className="cm-status-select"
            disabled={busy}
            value={task.status}
            onChange={(event) => onStatusChange(task.id, event.target.value as TaskStatus)}
            style={{ display: "block", marginTop: 6, minHeight: 44, width: "100%" }}
          >
            {taskStatuses.map((status) => (
              <option key={status} value={status}>{taskStatusLabels[status]}</option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
