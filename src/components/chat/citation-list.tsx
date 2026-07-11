"use client";

import { Globe, BookOpen, Brain } from "lucide-react";
import type { ExplorationSource } from "@/lib/careers/exploration-schema";

// ── 标签图标映射 ────────────────────────────────────────

const labelIcons: Record<string, typeof Globe> = {
  "已核验职业库": BookOpen,
  "实时联网调研": Globe,
  "AI分析与推断": Brain,
};

const labelColors: Record<string, string> = {
  "已核验职业库": "text-green-600 bg-green-50 border-green-200",
  "实时联网调研": "text-blue-600 bg-blue-50 border-blue-200",
  "AI分析与推断": "text-amber-600 bg-amber-50 border-amber-200",
};

// ── Props ────────────────────────────────────────────────

interface CitationListProps {
  sources: ExplorationSource[];
}

// ── 组件 ─────────────────────────────────────────────────

export function CitationList({ sources }: CitationListProps) {
  if (sources.length === 0) return null;

  return (
    <div className="text-xs" role="list" aria-label="引用来源">
      <span className="font-medium text-gray-600 block mb-1">参考来源：</span>
      <ul className="space-y-1">
        {sources.map((source, i) => {
          const Icon = labelIcons[source.label] ?? Globe;
          const colorClass = labelColors[source.label] ?? "text-gray-500";

          return (
            <li key={i} role="listitem">
              <div
                className={`flex items-start gap-1.5 rounded-lg px-2 py-1 border ${colorClass}`}
              >
                <Icon size={12} className="shrink-0 mt-0.5" />
                <div className="min-w-0">
                  {source.url ? (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline underline-offset-2"
                    >
                      {source.title}
                    </a>
                  ) : (
                    <span className="font-medium">{source.title}</span>
                  )}
                  <span className="text-gray-400">
                    {" "}— {source.organization}
                  </span>
                  {source.accessedAt && (
                    <span className="text-gray-400">
                      {" "}· {source.accessedAt}
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
