"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { cn } from "@/components/ui/cn";
import { useMotionSafe } from "@/lib/motion/motion-safe";

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

  const listRef = useRef<HTMLDivElement>(null);
  const motionSafe = useMotionSafe();

  // 挂载时对按钮播放一次性 stagger;状态翻转不重播
  useLayoutEffect(() => {
    const root = listRef.current;
    if (!root || !motionSafe) return;
    const ctx = gsap.context(() => {
      gsap.from(root.querySelectorAll("button"), {
        opacity: 0,
        y: 8,
        duration: 0.32,
        ease: "power2.out",
        stagger: 0.04,
      });
    }, root);
    return () => ctx.revert();
  }, [motionSafe]);

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
      ref={listRef}
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
