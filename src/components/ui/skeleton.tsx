import { cn } from "./cn";

interface SkeletonProps {
  className?: string;
  /** 对辅助技术隐藏骨架 */
  ariaHidden?: boolean;
}

/**
 * 骨架屏
 *
 * 设置 aria-busy 到父容器
 * prefers-reduced-motion 下停止动画
 */
export function Skeleton({ className, ariaHidden = true }: SkeletonProps) {
  return (
    <div
      aria-hidden={ariaHidden}
      className={cn(
        "animate-pulse rounded-[var(--cm-radius-sm)] bg-[var(--cm-surface-soft)]",
        "motion-reduce:animate-none",
        className,
      )}
    />
  );
}

/**
 * 加载容器
 *
 * 为区域设置 aria-busy="true"
 */
export function SkeletonGroup({
  busy = true,
  className,
  children,
}: {
  busy?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div aria-busy={busy} className={className}>
      {children}
    </div>
  );
}
