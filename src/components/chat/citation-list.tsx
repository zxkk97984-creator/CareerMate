"use client";

import { Globe, BookOpen, Brain } from "lucide-react";
import type { ExplorationSource } from "@/lib/careers/exploration-schema";

// ── 标签图标映射 ────────────────────────────────────────

const labelIcons: Record<string, typeof Globe> = {
  "已核验职业库": BookOpen,
  "实时联网调研": Globe,
  "AI分析与推断": Brain,
};

// 色调沿用语义色（与 message-parts.tsx 的 label-* 类一致）
const labelTones: Record<string, { fg: string; bg: string; border: string }> = {
  "已核验职业库": {
    fg: "var(--cm-success)",
    bg: "var(--cm-success-bg)",
    border: "var(--cm-success-bg)",
  },
  "实时联网调研": {
    fg: "var(--cm-info)",
    bg: "var(--cm-info-bg)",
    border: "var(--cm-info-bg)",
  },
  "AI分析与推断": {
    fg: "var(--cm-warning)",
    bg: "var(--cm-warning-bg)",
    border: "var(--cm-warning-bg)",
  },
};

const fallbackTone = {
  fg: "var(--cm-text-muted)",
  bg: "var(--cm-surface-soft)",
  border: "var(--cm-border)",
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
      <span className="font-medium text-[var(--cm-text-muted)] block mb-1">参考来源：</span>
      <ul className="space-y-1">
        {sources.map((source, i) => {
          const Icon = labelIcons[source.label] ?? Globe;
          const tone = labelTones[source.label] ?? fallbackTone;

          return (
            <li key={i} role="listitem">
              <div
                className="flex items-start gap-1.5 rounded-lg px-2 py-1 border"
                style={{ borderColor: tone.border, background: tone.bg, color: tone.fg }}
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
                  <span className="text-[var(--cm-text-subtle)]">
                    {" "}· {source.organization}
                  </span>
                  {source.accessedAt && (
                    <span className="text-[var(--cm-text-subtle)]">
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
