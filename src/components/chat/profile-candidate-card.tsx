"use client";

import { useState } from "react";
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
    newValue?: string,
  ) => Promise<void>;
}

// ── 组件 ─────────────────────────────────────────────────

export function ProfileCandidateCard({
  candidate,
  onAction,
}: ProfileCandidateCardProps) {
  const [status, setStatus] = useState(candidate.status);
  const [loading, setLoading] = useState(false);

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
    newValue?: string,
  ) {
    setLoading(true);
    try {
      await onAction(candidate.id, action, newValue);
      setStatus(action === "reject" ? "rejected" : "accepted");
    } finally {
      setLoading(false);
    }
  }

  // 已处理状态：简洁展示
  if (status !== "pending") {
    return (
      <div
        className={`rounded-xl p-4 text-sm ${
          status === "accepted"
            ? "bg-green-50 border border-green-200"
            : "bg-gray-50 border border-gray-200"
        }`}
        role="status"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-800">{fieldName}</span>
          <span className="text-xs">
            {status === "accepted" ? "✅ 已确认" : "❌ 已忽略"}
          </span>
        </div>
        <span className="text-xs text-gray-500">{formatValue(candidate.newValue)}</span>
      </div>
    );
  }

  // 待确认状态：完整信息 + 操作按钮
  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 text-sm"
      role="region"
      aria-label={`${fieldName}候选更新`}
    >
      {/* 字段名 + 置信度 */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-gray-800">{fieldName}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
          置信度 {Math.round(candidate.confidence * 100)}%
        </span>
      </div>

      {/* 旧值 → 新值 */}
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
        <span className="line-through">{formatValue(candidate.oldValue)}</span>
        <span>→</span>
        <span className="font-medium text-gray-800">
          {formatValue(candidate.newValue)}
        </span>
      </div>

      {/* 原文依据 */}
      {candidate.evidenceExcerpt && (
        <blockquote className="text-xs text-gray-500 border-l-2 border-purple-200 pl-2 mb-2">
          "{candidate.evidenceExcerpt}"
        </blockquote>
      )}

      {/* 依据说明 */}
      <p className="text-xs text-gray-600 mb-2">{candidate.reason}</p>

      {/* 计划影响 */}
      {candidate.impactSummary && (
        <p className="text-xs text-blue-600 mb-3">
          📋 {candidate.impactSummary}
        </p>
      )}

      {/* 操作按钮 */}
      <div className="flex gap-2" role="group" aria-label="候选操作">
        <button
          onClick={() => handleAction("accept")}
          disabled={loading}
          className="px-3 py-1.5 text-xs rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          确认
        </button>
        <button
          onClick={() => handleAction("edit")}
          disabled={loading}
          className="px-3 py-1.5 text-xs rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50 transition-colors"
        >
          修改
        </button>
        <button
          onClick={() => handleAction("reject")}
          disabled={loading}
          className="px-3 py-1.5 text-xs rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          忽略
        </button>
      </div>
    </div>
  );
}
