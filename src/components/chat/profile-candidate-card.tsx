"use client";

import { useEffect, useRef, useState } from "react";
import { playSettle } from "@/lib/motion/settle";
import { abilityLabels, type AbilityKey } from "@/lib/types";

// ── 字段中文映射 ────────────────────────────────────────

const fieldLabels: Record<string, string> = {
  educationStage: "学历阶段",
  major: "专业",
  targetRole: "目标岗位",
  targetRoleLabel: "目标岗位名称",
  weeklyAvailableHours: "每周可用时间",
  learningPreference: "学习偏好",
  experienceSummary: "经验概述",
  interestTags: "兴趣标签",
  constraints: "限制条件",
};

// 动态添加能力维度中文名
for (const key of Object.keys(abilityLabels)) {
  fieldLabels[`abilityScores.${key}`] = abilityLabels[key as AbilityKey];
}

// ── Props ────────────────────────────────────────────────

interface ProfileCandidateCardProps {
  candidate: {
    id: string;
    field: string;
    oldValue: unknown;
    newValue: unknown;
    confidence: number;
    reason: string;
    status: string;
    evidenceExcerpt: string;
    impactSummary: string;
  };
  onAction: (
    candidateId: string,
    action: "accept" | "edit" | "reject",
    newValue?: unknown,
  ) => Promise<void>;
}

// ── 组件 ─────────────────────────────────────────────────

export function ProfileCandidateCard({
  candidate,
  onAction,
}: ProfileCandidateCardProps) {
  const [status, setStatus] = useState(candidate.status);
  const [displayValue, setDisplayValue] = useState(candidate.newValue);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(
    Array.isArray(candidate.newValue)
      ? candidate.newValue.join("、")
      : String(candidate.newValue ?? ""),
  );
  const [editError, setEditError] = useState("");
  const [actionError, setActionError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status !== "pending") playSettle(rootRef.current);
  }, [status]);

  const fieldName = fieldLabels[candidate.field] ?? candidate.field;

  // 格式化值显示
  function formatValue(value: unknown): string {
    if (value === null || value === undefined) return "无";
    if (Array.isArray(value)) return value.join("、");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  async function handleAction(
    action: "accept" | "edit" | "reject",
    newValue?: unknown,
  ) {
    setLoading(true);
    setActionError("");
    try {
      await onAction(candidate.id, action, newValue);
      if (action === "edit" && newValue !== undefined) setDisplayValue(newValue);
      setStatus(action === "reject" ? "rejected" : "accepted");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "操作失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  function submitEdit() {
    const trimmed = editValue.trim();
    if (!trimmed) {
      setEditError("请输入修改后的值");
      return;
    }
    let value: unknown = trimmed;
    if (typeof candidate.newValue === "number") {
      value = Number(trimmed);
      if (!Number.isFinite(value)) {
        setEditError("请输入有效数字");
        return;
      }
    } else if (Array.isArray(candidate.newValue)) {
      value = trimmed.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean);
    }
    setEditError("");
    void handleAction("edit", value);
  }

  return (
    <div ref={rootRef}>
      {status !== "pending" ? (
        // 已处理状态：简洁展示
        <div
          className={`rounded-xl border p-4 text-sm ${
            status === "accepted"
              ? "border-[var(--cm-border)] bg-[var(--cm-success-bg)]"
              : "border-[var(--cm-border)] bg-[var(--cm-surface-soft)]"
          }`}
          role="region"
          aria-label={`${fieldName}候选更新`}
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--cm-text-strong)]">{fieldName}</span>
            <span className="text-xs text-[var(--cm-text-muted)]">
              {status === "accepted" ? "✅ 已确认" : "❌ 已忽略"}
            </span>
          </div>
          <span className="text-xs text-[var(--cm-text-muted)]">{formatValue(displayValue)}</span>
        </div>
      ) : (
        // 待确认状态：完整信息 + 操作按钮
        <div
          className="rounded-xl border border-[var(--cm-border-strong)] bg-[var(--cm-surface)] p-4 text-sm"
          role="region"
          aria-label={`${fieldName}候选更新`}
        >
          {/* 字段名 + 置信度 */}
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-[var(--cm-text-strong)]">{fieldName}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--cm-tint-brand)] text-[var(--cm-brand-ink)]">
              置信度 {Math.round(candidate.confidence * 100)}%
            </span>
          </div>

          {/* 旧值 → 新值 */}
          <div className="flex items-center gap-2 text-xs text-[var(--cm-text-muted)] mb-2">
            <span className="line-through">{formatValue(candidate.oldValue)}</span>
            <span>→</span>
            <span className="font-medium text-[var(--cm-text-strong)]">
              {formatValue(candidate.newValue)}
            </span>
          </div>

          {/* 原文依据 */}
          {candidate.evidenceExcerpt && (
            <blockquote className="text-xs text-[var(--cm-text-muted)] border-l-2 border-[var(--cm-border-strong)] pl-2 mb-2">
              &ldquo;{candidate.evidenceExcerpt}&rdquo;
            </blockquote>
          )}

          {/* 依据说明 */}
          <p className="text-xs text-[var(--cm-text-muted)] mb-2">{candidate.reason}</p>

          {/* 计划影响 */}
          {candidate.impactSummary && (
            <p className="text-xs text-[var(--cm-info)] mb-3">
              📋 {candidate.impactSummary}
            </p>
          )}

          {/* 操作按钮 */}
          {editing && (
            <div className="mb-3">
              <input
                value={editValue}
                onChange={(event) => setEditValue(event.target.value)}
                className="w-full rounded-lg border border-[var(--cm-border-strong)] bg-[var(--cm-surface)] px-3 py-2 text-xs text-[var(--cm-text-strong)] outline-none focus:border-[var(--cm-brand)]"
                aria-label={`修改${fieldName}`}
              />
              {editError && <p className="mt-1 text-xs text-[var(--cm-danger)]">{editError}</p>}
            </div>
          )}
          <div className="flex gap-2" role="group" aria-label="候选操作">
            <button
              onClick={() => handleAction("accept")}
              disabled={loading}
              className="px-3 py-1.5 text-xs rounded-lg bg-[var(--cm-gradient-brand)] text-white hover:brightness-95 disabled:opacity-50 transition-colors"
            >
              确认
            </button>
            {editing ? (
              <>
                <button
                  onClick={submitEdit}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs rounded-lg bg-[var(--cm-info)] text-white hover:brightness-95 disabled:opacity-50 transition-colors"
                >
                  确认修改
                </button>
                <button
                  onClick={() => setEditing(false)}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs rounded-lg bg-[var(--cm-surface-soft)] text-[var(--cm-text-muted)] hover:bg-[var(--cm-surface-sunken)] disabled:opacity-50 transition-colors"
                >
                  取消
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                disabled={loading}
                className="px-3 py-1.5 text-xs rounded-lg bg-[var(--cm-tint-brand)] text-[var(--cm-brand-ink)] hover:brightness-95 disabled:opacity-50 transition-colors"
              >
                修改
              </button>
            )}
            <button
              onClick={() => handleAction("reject")}
              disabled={loading}
              className="px-3 py-1.5 text-xs rounded-lg bg-[var(--cm-surface-soft)] text-[var(--cm-text-muted)] hover:bg-[var(--cm-surface-sunken)] disabled:opacity-50 transition-colors"
            >
              忽略
            </button>
          </div>
          {actionError ? <p className="mt-2 text-xs text-[var(--cm-danger)]" role="alert">{actionError}</p> : null}
        </div>
      )}
    </div>
  );
}
