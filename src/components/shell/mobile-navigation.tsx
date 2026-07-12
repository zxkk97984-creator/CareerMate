"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mainNavItems } from "./nav-items";
import { cn } from "@/components/ui/cn";

interface MobileNavigationProps {
  pendingCandidateCount?: number;
  className?: string;
}

/**
 * 移动端底部导航栏
 *
 * 仅在 ≤768px 时显示，提供快速导航入口
 */
export function MobileNavigation({
  pendingCandidateCount = 0,
  className,
}: MobileNavigationProps) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--cm-border)] bg-[var(--cm-surface)]",
        "flex items-center justify-around py-2 md:hidden",
        className,
      )}
      data-testid="mobile-navigation"
      aria-label="移动端导航"
    >
      {mainNavItems.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-0.5 px-2 py-1 text-[11px]",
              active
                ? "text-[var(--cm-brand)]"
                : "text-[var(--cm-text-muted)]",
            )}
            aria-current={active ? "page" : undefined}
          >
            <item.icon size={20} aria-hidden="true" />
            <span>
              {item.label}
              {item.href === "/memory" && pendingCandidateCount > 0 && (
                <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--cm-danger)] px-1 text-[10px] text-white">
                  {pendingCandidateCount}
                </span>
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
