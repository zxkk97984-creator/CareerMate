import { type ReactNode } from "react";
import { PackageOpen, type LucideIcon } from "lucide-react";
import { cn } from "./cn";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * 空状态占位
 *
 * 用于无数据、无搜索结果等场景
 */
export function EmptyState({
  icon: Icon = PackageOpen,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-16 text-center",
        className,
      )}
    >
      <Icon
        className="h-12 w-12 text-[var(--cm-text-subtle)]"
        aria-hidden="true"
      />
      <h3 className="text-base font-semibold text-[var(--cm-text-strong)]">
        {title}
      </h3>
      {description && (
        <p className="max-w-sm text-sm text-[var(--cm-text-muted)]">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
