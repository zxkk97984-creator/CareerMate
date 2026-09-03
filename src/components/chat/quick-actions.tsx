"use client";

import { useCallback, useState } from "react";
import { cn } from "@/components/ui/cn";

// ── 类型 ────────────────────────────────────────

export interface QuickActionItem {
  id: string;
  label: string;
  value: string;
}

export interface QuickActionsProps {
  questionId: string;
  actions: QuickActionItem[];
  status: "pending" | "resolved" | "obsolete";
  onSelect: (actionId: string, value: string) => void;
}

// ── 组件 ────────────────────────────────────────

export function QuickActions({ questionId, actions, status, onSelect }: QuickActionsProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleClick = useCallback(
    (action: QuickActionItem) => {
      if (status !== "pending" || selectedId) return;
      setSelectedId(action.id);
      onSelect(action.id, action.value);
    },
    [status, selectedId, onSelect],
  );

  if (status === "obsolete" || actions.length === 0) return null;

  return (
    <div
      data-testid="quick-actions"
      data-question-id={questionId}
      data-status={status}
      className="flex flex-wrap gap-2 mt-3"
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          disabled={status !== "pending" || selectedId !== null}
          data-action-id={action.id}
          data-selected={selectedId === action.id}
          className={cn(
            "inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition-colors",
            selectedId === action.id
              ? "border-transparent bg-[var(--cm-gradient-brand)] text-white"
              : selectedId
                ? "border-[var(--cm-border)] bg-[var(--cm-surface-soft)] text-[var(--cm-text-subtle)]"
                : "border-[var(--cm-border-strong)] bg-[var(--cm-surface)] text-[var(--cm-text-strong)] hover:border-[var(--cm-brand-ink)] hover:bg-[var(--cm-tint-brand)] hover:text-[var(--cm-brand-ink)]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
          onClick={() => handleClick(action)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
