"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "./cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: LucideIcon;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--cm-gradient-brand)] text-white hover:bg-[var(--cm-brand)] hover:-translate-y-0.5 shadow-sm active:scale-[0.98]",
  secondary:
    "border border-[var(--cm-border-strong)] bg-[var(--cm-surface)] text-[var(--cm-text-strong)] hover:bg-[var(--cm-surface-soft)] hover:border-[var(--cm-border-strong)] hover:-translate-y-0.5 active:scale-[0.98]",
  // hover 时文字加深、背景上品牌浅底：对比只升不降（7.4:1 → 约 15.7:1）
  ghost:
    "text-[var(--cm-text-muted)] hover:bg-[var(--cm-tint-brand)] hover:text-[var(--cm-text-strong)] active:scale-[0.98]",
  // 实心按钮反色用更深的底，不用 opacity —— 降透明度会同时压低白字对比
  danger:
    "bg-[var(--cm-danger)] text-white hover:bg-[var(--cm-danger-hover)] active:scale-[0.98]",
  icon: "text-[var(--cm-text-muted)] hover:bg-[var(--cm-tint-brand)] hover:text-[var(--cm-text-strong)] active:scale-[0.98]",
};

/**
 * 统一按钮组件
 *
 * variant: primary | secondary | ghost | danger | icon
 * 支持 loading 状态、图标、disabled
 * 最小触控高度 44px
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    loading = false,
    icon: Icon,
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[var(--cm-radius-control)] px-4 text-sm font-semibold",
        "transition-[transform,box-shadow,background-color,border-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
        "min-h-[44px] min-w-[44px]",
        variantStyles[variant],
        variant === "icon" && "px-0",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : Icon ? (
        <Icon className="h-4 w-4" aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
});

export { Button, type ButtonProps, type ButtonVariant };
