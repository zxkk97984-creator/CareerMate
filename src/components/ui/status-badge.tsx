import { type ReactNode } from "react";
import { cn } from "./cn";

type StatusTone = "success" | "info" | "warning" | "danger" | "neutral";

interface StatusBadgeProps {
  tone?: StatusTone;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

const toneStyles: Record<StatusTone, string> = {
  success: "bg-[var(--cm-success-bg)] text-[var(--cm-success)]",
  info: "bg-[var(--cm-info-bg)] text-[var(--cm-info)]",
  warning: "bg-[var(--cm-warning-bg)] text-[var(--cm-warning)]",
  danger: "bg-[var(--cm-danger-bg)] text-[var(--cm-danger)]",
  neutral: "bg-[var(--cm-canvas)] text-[var(--cm-text-muted)]",
};

/**
 * 状态徽章
 *
 * 同时展示图标和文字，不只依赖颜色传达状态
 * tone: success | info | warning | danger | neutral
 */
export function StatusBadge({
  tone = "neutral",
  icon,
  className,
  children,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--cm-radius-sm)] px-2.5 py-1 text-xs font-medium",
        toneStyles[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
