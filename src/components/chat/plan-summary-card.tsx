"use client";

import { useState } from "react";
import { ArrowRight, Calendar, Target } from "lucide-react";

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

  // 提取当前月目标
  const currentMonth = (plan.months as Array<Record<string, unknown>>)?.[
    plan.currentMonthIndex - 1
  ];
  const currentGoal = (currentMonth?.goal as string) ?? "执行本月计划";

  // 提取本周行动（最多3条）
  const thisWeek = ((currentMonth?.learningTasks as Array<{ title: string; status: string }>) ?? [])
    .filter((t) => t.status !== "done")
    .slice(0, 3);

  async function handleAccept() {
    if (!onAcceptReplan) return;
    setLoading(true);
    try {
      await onAcceptReplan(plan.id);
      setConfirmed(true);
    } finally {
      setLoading(false);
    }
  }

  const isPending = plan.status === "pending" && diff && !confirmed;

  return (
    <div
      className={`rounded-xl border p-4 text-sm ${
        isPending
          ? "border-blue-200 bg-blue-50/30"
          : "border-purple-100 bg-purple-50/20"
      }`}
      role="region"
      aria-label={`${plan.targetRole} 计划 v${plan.version}`}
    >
      {/* 头部：岗位 + 版本 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-purple-600" />
          <span className="font-semibold text-gray-800">{plan.targetRole}</span>
          <span className="text-xs text-gray-400">v{plan.version}</span>
        </div>
        {isPending && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
            待确认
          </span>
        )}
      </div>

      {/* 当前月目标 */}
      <div className="flex items-start gap-1 text-xs text-gray-600 mb-1">
        <Calendar size={14} className="text-gray-400 mt-0.5 shrink-0" />
        <span>第{plan.currentMonthIndex}个月：{currentGoal}</span>
      </div>

      {/* 本周行动 */}
      {thisWeek.length > 0 && (
        <ul className="text-xs text-gray-500 space-y-1 mb-3 mt-2">
          {thisWeek.map((task, i) => (
            <li key={i} className="flex items-center gap-1">
              <ArrowRight size={10} className="text-purple-400 shrink-0" />
              {task.title}
            </li>
          ))}
        </ul>
      )}

      {/* 重规划差异 */}
      {isPending && (
        <div className="text-xs bg-white rounded-lg p-2 mb-3 space-y-1">
          {diff.directionChange && diff.directionSummary && (
            <p className="text-blue-700">🔄 {diff.directionSummary}</p>
          )}
          {diff.addedTasks.length > 0 && (
            <p className="text-green-700">
              ➕ 新增：{diff.addedTasks.join("、")}
            </p>
          )}
          {diff.removedTasks.length > 0 && (
            <p className="text-red-500">
              ➖ 移除：{diff.removedTasks.join("、")}
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
            className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "处理中..." : "确认新版本"}
          </button>
        )}
        {onViewPlan && (
          <button
            onClick={() => onViewPlan(plan.id)}
            className="px-3 py-1.5 text-xs rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
          >
            查看完整计划
          </button>
        )}
      </div>
    </div>
  );
}
