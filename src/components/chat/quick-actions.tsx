"use client";

import { useCallback, useState } from "react";

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
          className={`
            px-4 py-2 text-sm rounded-full border transition-colors
            ${selectedId === action.id
              ? "bg-primary text-primary-foreground border-primary"
              : selectedId
                ? "bg-muted text-muted-foreground border-muted"
                : "bg-card hover:bg-accent border-border cursor-pointer"
            }
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
          onClick={() => handleClick(action)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
