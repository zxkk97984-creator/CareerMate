"use client";

import { useState } from "react";
import { FileText, CheckCircle } from "lucide-react";
import type { ExplorationSource } from "@/lib/careers/exploration-schema";

interface ExplorationReportCardProps {
  report: {
    id: string;
    roleName: string;
    status: string;
    summary: string;
    coreCompetencies: string[];
    entryPaths: string[];
    learningSuggestions: string[];
    fitAnalysis: string[];
    sources: ExplorationSource[];
  };
  sourceLabel: "精品职业资料" | "实时联网调研" | "AI分析与推断";
  onSubmit?: (reportId: string) => Promise<void>;
}

export function ExplorationReportCard({
  report,
  sourceLabel,
  onSubmit,
}: ExplorationReportCardProps) {
  const isSubmitted = report.status === "submitted";
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!onSubmit || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(report.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "报告提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="rounded-xl border border-blue-200 bg-blue-50/20 p-4 text-sm"
      role="region"
      aria-label={`${report.roleName} 职业探索报告`}
    >
      {/* 头部：来源标签 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-blue-600" />
          <span className="font-semibold text-gray-800">{report.roleName}</span>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            sourceLabel === "精品职业资料"
              ? "bg-green-100 text-green-700"
              : sourceLabel === "实时联网调研"
                ? "bg-blue-100 text-blue-700"
                : "bg-amber-100 text-amber-700"
          }`}
        >
          {sourceLabel}
        </span>
      </div>

      {/* 概述 */}
      <p className="text-xs text-gray-600 mb-2">{report.summary}</p>

      {/* 核心能力 */}
      {report.coreCompetencies.length > 0 && (
        <div className="mb-2">
          <span className="text-xs font-medium text-gray-700">核心能力：</span>
          <span className="text-xs text-gray-500">
            {report.coreCompetencies.slice(0, 5).join("、")}
          </span>
        </div>
      )}

      {/* 匹配分析 (AI推断标注) */}
      {report.fitAnalysis.length > 0 && (
        <div className="text-xs text-gray-500 bg-white rounded-lg p-2 mb-2">
          {report.fitAnalysis.map((item, i) => (
            <p key={i} className="italic">
              💡 {item}
            </p>
          ))}
        </div>
      )}

      {/* 来源数量 */}
      <p className="text-xs text-gray-400 mb-3">
        基于 {report.sources.length} 个来源
      </p>

      {/* 提交审核按钮 */}
      {!isSubmitted && onSubmit && (
        <button
          onClick={submit}
          disabled={submitting}
          className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          {submitting ? "提交中..." : "提交到共享职业库"}
        </button>
      )}
      {isSubmitted && (
        <span className="text-xs text-green-600 flex items-center gap-1">
          <CheckCircle size={12} /> 已提交审核
        </span>
      )}
      {error ? <p className="mt-2 text-xs text-red-600" role="alert">{error}</p> : null}
    </div>
  );
}
