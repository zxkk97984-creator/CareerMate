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
    "bg-[var(--cm-brand)] text-white hover:bg-[var(--cm-brand-hover)] shadow-sm",
  secondary:
    "border border-[var(--cm-border-strong)] bg-[var(--cm-surface)] text-[var(--cm-text-strong)] hover:bg-[var(--cm-canvas)]",
  ghost:
    "text-[var(--cm-text-muted)] hover:bg-[var(--cm-surface-soft)] hover:text-[var(--cm-brand)]",
  danger:
    "bg-[var(--cm-danger)] text-white hover:opacity-90",
  icon: "text-[var(--cm-text-muted)] hover:bg-[var(--cm-surface-soft)] hover:text-[var(--cm-brand)]",
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
        "inline-flex items-center justify-center gap-2 rounded-[var(--cm-radius-control)] px-4 text-sm font-semibold transition-colors",
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
