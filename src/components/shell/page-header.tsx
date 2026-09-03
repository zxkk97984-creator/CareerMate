import { type ReactNode } from "react";
import { cn } from "@/components/ui/cn";

interface PageHeaderProps {
  /** 页面图标 */
  icon?: ReactNode;
  /** 主标题 */
  title: string;
  /** 说明文字 */
  description?: string;
  /** 右侧操作区 */
  actions?: ReactNode;
  /** AI 运行状态 */
  aiStatus?: ReactNode;
  className?: string;
}

/**
 * 统一页面头
 *
 * 包含图标、标题、说明、操作按钮和 AI 状态
 */
export function PageHeader({
  icon,
  title,
  description,
  actions,
  aiStatus,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "cm-page-header flex flex-wrap items-start justify-between gap-4 px-2 pb-4",
        className,
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <div className="mt-1 flex-shrink-0 text-[var(--cm-brand-ink)]" aria-hidden="true">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--cm-text-strong)] truncate">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-[var(--cm-text-muted)]">
              {description}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        {aiStatus}
        {actions}
      </div>
    </header>
  );
}
