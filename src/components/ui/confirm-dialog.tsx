"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { cn } from "./cn";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/**
 * 确认弹窗
 *
 * 支持 Escape 关闭、遮罩关闭、焦点管理
 * danger 操作按钮使用红色
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = false,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // 保存打开前的焦点
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    }
  }, [open]);

  // 焦点恢复到触发元素
  useEffect(() => {
    if (!open && previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
  }, [open]);

  // Escape 关闭
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // 打开时锁定 body 滚动
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 弹窗卡片 */}
      <div
        ref={dialogRef}
        className={cn(
          "relative z-10 w-full max-w-md rounded-[var(--cm-radius-container)] bg-[var(--cm-surface)] p-6",
          "shadow-[var(--cm-shadow-float)]",
        )}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-[var(--cm-radius-sm)] p-1 text-[var(--cm-text-muted)] hover:bg-[var(--cm-surface-soft)]"
          aria-label="关闭"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-lg font-semibold text-[var(--cm-text-strong)] pr-8">
          {title}
        </h2>

        {description && (
          <div className="mt-2 text-sm text-[var(--cm-text-muted)]">
            {description}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
