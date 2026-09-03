"use client";

import { useState, useMemo } from "react";
import { ArrowRight, Calendar, Target, Layers, RefreshCw, Plus, Minus } from "lucide-react";

// ── Types ────────────────────────────────────────────────

interface PlanV2Phase {
  title: string;
  goal?: string;
  actions?: Array<{ id: string; title: string; status: string; estimatedHours?: number }>;
}

interface PlanV2Content {
  schemaVersion: 2;
  title?: string;
  summary?: string;
  targetRole?: { key: string; label: string };
  horizon?: { value: number; unit: string };
  phases?: PlanV2Phase[];
}

function parsePlanV2(raw: string | null | undefined): PlanV2Content | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.schemaVersion === 2) return parsed as PlanV2Content;
  } catch { /* ignore */ }
  return null;
}

// ── Props ────────────────────────────────────────────────

interface PlanSummaryCardProps {
  plan: {
    id: string;
    targetRole: string;
    version: number;
    status: string;
    months: Array<Record<string, unknown>>;
    currentMonthIndex: number;
    generationMeta: {
      triggeredBy: string;
      conversationId?: string;
    };
    /** Plan V2 字段 */
    schemaVersion?: number;
    content?: string | null;
    targetRoleLabel?: string | null;
  };
  /** 待确认的重规划差异（可选） */
  diff?: {
    directionChange: boolean;
    directionSummary?: string;
    addedTasks: string[];
    removedTasks: string[];
  } | null;
  onAcceptReplan?: (planId: string) => Promise<void>;
  onViewPlan?: (planId: string) => void;
}

// ── 组件 ─────────────────────────────────────────────────

export function PlanSummaryCard({
  plan,
  diff,
  onAcceptReplan,
  onViewPlan,
}: PlanSummaryCardProps) {
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");

  const isV2 = (plan.schemaVersion ?? 1) >= 2;
  const v2 = useMemo(() => isV2 ? parsePlanV2(plan.content ?? null) : null, [isV2, plan.content]);

  // V1：提取当前月目标
  const currentMonth = (plan.months as Array<Record<string, unknown>>)?.[
    plan.currentMonthIndex - 1
  ];
  const currentGoal = (currentMonth?.goal as string) ?? "执行本月计划";

  // V1：提取本周行动（最多3条）
  const thisWeek = ((currentMonth?.learningTasks as Array<{ title: string; status: string }>) ?? [])
    .filter((t) => t.status !== "done")
    .slice(0, 3);

  // V2：提取当前阶段和立即行动
  const currentPhase = v2?.phases?.[0];
  const horizon = v2?.horizon;
  const v2Goal = currentPhase?.goal ?? currentPhase?.title ?? v2?.summary ?? "推进当前阶段";
  const v2Actions = (currentPhase?.actions ?? [])
    .filter((a) => a.status !== "done" && a.status !== "cancelled")
    .slice(0, 3);

  async function handleAccept() {
    if (!onAcceptReplan) return;
    setLoading(true);
    setError("");
    try {
      await onAcceptReplan(plan.id);
      setConfirmed(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "计划确认失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  const isPending = plan.status === "pending" && !confirmed;

  return (
    <div
      className={`rounded-xl border p-4 text-sm ${
        isPending
          ? "border-[var(--cm-warning)] bg-[var(--cm-warning-bg)]"
          : "border-[var(--cm-border)] bg-[var(--cm-surface)]"
      }`}
      role="region"
      aria-label={`${plan.targetRole} 计划 v${plan.version}`}
    >
      {/* 头部：岗位 + 版本 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-[var(--cm-brand-ink)]" />
          <span className="font-semibold text-[var(--cm-text-strong)]">
            {plan.targetRoleLabel ?? plan.targetRole}
          </span>
          <span className="text-xs text-[var(--cm-text-subtle)]">
            {isV2 ? `V2` : `v${plan.version}`}
          </span>
        </div>
        {isPending && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--cm-surface-soft)] text-[var(--cm-text-muted)] border border-[var(--cm-border)]">
            待确认
          </span>
        )}
      </div>

      {/* V2 计划：自由周期 + 当前阶段 */}
      {isV2 && v2 ? (
        <>
          <div className="flex items-start gap-1 text-xs text-[var(--cm-text-muted)] mb-1">
            <Layers size={14} className="text-[var(--cm-text-subtle)] mt-0.5 shrink-0" />
            <span>
              {horizon
                ? `周期 ${horizon.value} ${horizon.unit}${horizon.value > 1 ? "s" : ""} · `
                : ""}
              {v2Goal}
            </span>
          </div>
          {v2Actions.length > 0 ? (
            <ul className="text-xs text-[var(--cm-text-muted)] space-y-1 mb-3 mt-2">
              {v2Actions.map((action, i) => (
                <li key={action.id || i} className="flex items-center gap-1">
                  <ArrowRight size={10} className="text-[var(--cm-brand-ink)] shrink-0" />
                  {action.title}
                  {action.estimatedHours ? ` (≈${action.estimatedHours}h)` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[var(--cm-text-subtle)] mb-3 mt-2">{v2.summary ?? "查看完整计划了解详情"}</p>
          )}
        </>
      ) : (
        <>
          {/* 当前月目标（V1 模板） */}
          <div className="flex items-start gap-1 text-xs text-[var(--cm-text-muted)] mb-1">
            <Calendar size={14} className="text-[var(--cm-text-subtle)] mt-0.5 shrink-0" />
            <span>第{plan.currentMonthIndex}个月：{currentGoal}</span>
          </div>

          {/* 本周行动（V1 模板） */}
          {thisWeek.length > 0 && (
            <ul className="text-xs text-[var(--cm-text-muted)] space-y-1 mb-3 mt-2">
              {thisWeek.map((task, i) => (
                <li key={i} className="flex items-center gap-1">
                  <ArrowRight size={10} className="text-[var(--cm-brand-ink)] shrink-0" />
                  {task.title}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* 重规划差异 */}
      {isPending && diff && (
        <div className="text-xs bg-[var(--cm-surface)] border border-[var(--cm-border)] rounded-lg p-2 mb-3 space-y-1">
          {diff.directionChange && diff.directionSummary && (
            <p className="flex items-start gap-1.5 text-[var(--cm-info)]">
              <RefreshCw size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
              {diff.directionSummary}
            </p>
          )}
          {diff.addedTasks.length > 0 && (
            <p className="flex items-start gap-1.5 text-[var(--cm-success)]">
              <Plus size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
              新增：{diff.addedTasks.join("、")}
            </p>
          )}
          {diff.removedTasks.length > 0 && (
            <p className="flex items-start gap-1.5 text-[var(--cm-danger)]">
              <Minus size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
              移除：{diff.removedTasks.join("、")}
            </p>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex gap-2">
        {isPending && onAcceptReplan && (
          <button
            onClick={handleAccept}
            disabled={loading}
            className="px-3 py-1.5 text-xs rounded-lg bg-[var(--cm-info)] text-white hover:brightness-95 disabled:opacity-50 transition-colors"
          >
            {loading ? "处理中..." : "确认新版本"}
          </button>
        )}
        {onViewPlan && (
          <button
            onClick={() => onViewPlan(plan.id)}
            className="px-3 py-1.5 text-xs rounded-lg bg-[var(--cm-tint-brand)] text-[var(--cm-brand-ink)] hover:brightness-95 transition-colors"
          >
            查看完整计划
          </button>
        )}
      </div>
      {error ? <p className="mt-2 text-xs text-[var(--cm-danger)]" role="alert">{error}</p> : null}
    </div>
  );
}
