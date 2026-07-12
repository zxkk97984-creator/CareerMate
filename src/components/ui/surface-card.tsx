import { type ReactNode } from "react";
import { cn } from "./cn";

type SurfacePadding = "sm" | "md" | "lg";

interface SurfaceCardProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  padding?: SurfacePadding;
  className?: string;
  children: ReactNode;
}

const paddingMap: Record<SurfacePadding, string> = {
  sm: "p-3",
  md: "p-5",
  lg: "p-6",
};

/**
 * 统一卡片容器
 *
 * 支持标题、说明、操作区、三种内边距
 * 卡片不自带业务色
 */
export function SurfaceCard({
  title,
  description,
  action,
  padding = "md",
  className,
  children,
}: SurfaceCardProps) {
  return (
    <section
      className={cn(
        "rounded-[var(--cm-radius-card)] border border-[var(--cm-border)] bg-[var(--cm-surface)]",
        "shadow-[var(--cm-shadow-card)]",
        className,
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-[var(--cm-border)] px-5 py-4">
          <div>
            {title && (
              <h2 className="text-base font-semibold text-[var(--cm-text-strong)]">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-sm text-[var(--cm-text-muted)]">
                {description}
              </p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className={paddingMap[padding]}>{children}</div>
    </section>
  );
}
