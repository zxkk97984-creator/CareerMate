"use client";

import { useId, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

/** Field 组件共享属性 */
interface FieldBaseProps {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
}

type FieldInputProps = FieldBaseProps &
  InputHTMLAttributes<HTMLInputElement> & {
    as: "input";
  };

type FieldTextareaProps = FieldBaseProps &
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    as: "textarea";
  };

type FieldSelectProps = FieldBaseProps &
  SelectHTMLAttributes<HTMLSelectElement> & {
    as: "select";
    children: React.ReactNode;
  };

type FieldProps = FieldInputProps | FieldTextareaProps | FieldSelectProps;

/**
 * 统一表单字段组件
 *
 * 使用 useId 关联 label、description、error
 * 支持 input / textarea / select
 * 错误时设置 aria-invalid
 */
export function Field(props: FieldProps) {
  const { label, description, error, required, as, className, ...rest } = props;
  const id = useId();
  const errorId = `${id}-error`;
  const descId = `${id}-desc`;

  const fieldClass = cn(
    "w-full rounded-[var(--cm-radius-control)] border bg-[var(--cm-surface)] px-3 py-2.5 text-sm text-[var(--cm-text-strong)]",
    "focus:outline-none focus:ring-2 focus:ring-[var(--cm-brand)] focus:border-[var(--cm-brand)]",
    "min-h-[44px]",
    error
      ? "border-[var(--cm-danger)]"
      : "border-[var(--cm-border-strong)]",
    className,
  );

  const describedBy = [error ? errorId : null, description ? descId : null]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-[var(--cm-text-strong)]">
        {label}
        {required && <span className="text-[var(--cm-danger)] ml-0.5" aria-hidden="true">*</span>}
      </label>

      {description && (
        <p id={descId} className="text-xs text-[var(--cm-text-subtle)]">
          {description}
        </p>
      )}

      {as === "select" ? (
        <select
          id={id}
          className={fieldClass}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...(rest as SelectHTMLAttributes<HTMLSelectElement>)}
        >
          {(props as FieldSelectProps).children}
        </select>
      ) : as === "textarea" ? (
        <textarea
          id={id}
          className={cn(fieldClass, "resize-y min-h-[80px]")}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : (
        <input
          id={id}
          className={fieldClass}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...(rest as InputHTMLAttributes<HTMLInputElement>)}
        />
      )}

      {error && (
        <p id={errorId} className="text-xs text-[var(--cm-danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
