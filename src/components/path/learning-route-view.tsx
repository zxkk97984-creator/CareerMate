"use client";

import { toLearningRouteView, type LearningRouteView } from "@/lib/learning-route";

interface LearningRouteViewProps {
  content: unknown;
  relatedPlan: { id: string; targetRoleLabel: string | null; version: number; status: string } | null;
  basePlanVersion: number | number[] | null;
}

/**
 * 学习路线展示（plan 4.3 “学习安排”）：用显式 adapter 投影，不直接渲染 z.unknown 数组。
 * 与关联计划版本并列；关联的是归档计划时提示“需复盘，不自动迁移”。
 */
export function LearningRouteDisplay({ content, relatedPlan, basePlanVersion }: LearningRouteViewProps) {
  const view = toLearningRouteView(content, relatedPlan, basePlanVersion);
  return <LearningRouteViewBody view={view} />;
}

export function LearningRouteViewBody({ view }: { view: LearningRouteView }) {
  if (!view.present) {
    return <p style={{ margin: 0, fontSize: 13.5, color: "var(--cm-text-muted)" }}>{view.degraded ?? "还没有已确认的学习安排。"}</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {view.targetRole && (
        <div style={{ marginTop: 0 }}>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--cm-text-subtle)" }}>目标岗位</span>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--cm-text-strong)" }}>{view.targetRole}</div>
        </div>
      )}

      {view.period && (
        <div style={{ fontSize: 13, color: "var(--cm-text-muted)" }}>
          周期：{view.period}{view.weeklyBudgetHours ? ` · 每周约 ${view.weeklyBudgetHours} 小时` : ""}
        </div>
      )}

      {view.stages.length > 0 && (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--cm-text-subtle)" }}>阶段</div>
          <ol style={{ margin: "6px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
            {view.stages.map((s, i) => (
              <li key={i} style={{ fontSize: 13.5, color: "var(--cm-text-strong)" }}>
                {s.title}
                {s.description ? <span style={{ color: "var(--cm-text-muted)" }}> — {s.description}</span> : null}
                {s.tasks?.length ? <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: "var(--cm-text-muted)" }}>{s.tasks.map((t, j) => <li key={j} style={{ fontSize: 12.5 }}>{t}</li>)}</ul> : null}
              </li>
            ))}
          </ol>
        </div>
      )}

      {view.tasks.length > 0 && (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--cm-text-subtle)" }}>学习任务</div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
            {view.tasks.map((t, i) => <li key={i} style={{ fontSize: 13.5, color: "var(--cm-text-strong)" }}>{t}</li>)}
          </ul>
        </div>
      )}

      {view.deliverables.length > 0 && (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--cm-text-subtle)" }}>交付物</div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 20, color: "var(--cm-text-muted)" }}>
            {view.deliverables.map((d, i) => <li key={i} style={{ fontSize: 13.5 }}>{d}</li>)}
          </ul>
        </div>
      )}

      {view.acceptanceCriteria.length > 0 && (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--cm-text-subtle)" }}>验收标准</div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 20, color: "var(--cm-text-muted)" }}>
            {view.acceptanceCriteria.map((c, i) => <li key={i} style={{ fontSize: 13.5 }}>{c}</li>)}
          </ul>
        </div>
      )}

      {view.relatedPlan && (
        <div style={{ paddingTop: 10, borderTop: "1px solid var(--cm-border)", fontSize: 12.5, color: "var(--cm-text-muted)" }}>
          关联计划：{view.relatedPlan.targetRoleLabel ?? "（未命名）"} v{view.relatedPlan.version}
          {view.basePlanVersion != null ? ` · 本路线基于计划 v${Array.isArray(view.basePlanVersion) ? view.basePlanVersion.join("、") : view.basePlanVersion}` : ""}
          {view.relatedPlan.archived ? " · （关联的是已归档计划，需复盘，不自动迁移）" : ""}
        </div>
      )}

      {view.degraded && <p style={{ margin: 0, fontSize: 12.5, color: "var(--cm-warning)" }}>{view.degraded}</p>}
    </div>
  );
}
