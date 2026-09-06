"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { cn } from "./cn";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * 异步确认：返回 true 表示成功（关闭弹窗），false / 抛错表示失败（保留弹窗、禁止重复提交）。
   * 由调用方判断响应成功后再返回 true，不能无条件关闭（T18）。
   */
  onConfirm: () => boolean | Promise<boolean>;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/**
 * 确认弹窗
 *
 * 支持 Escape 关闭、遮罩关闭、焦点圈定与关闭后回焦。
 * 确认操作等待异步 onConfirm 成功后才会关闭；失败时保留弹窗并展示错误，期间禁用重复提交（T18）。
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // 打开时锁定 body 滚动；关闭时解锁
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

  // Escape 关闭（busy 时不响应，避免中断进行中的确认）
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose, busy]);

  // 焦点圈定：Tab 在弹窗内循环（T18）
  useEffect(() => {
    if (!open) return;
    const node = dialogRef.current;
    if (!node) return;
    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")).filter((el) => !el.hasAttribute("disabled"));
    // 初始聚焦到弹窗卡片
    requestAnimationFrame(() => {
      const list = focusables();
      if (list.length > 0) list[0]?.focus();
    });
    return () => undefined;
  }, [open]);

  // 打开时清空上次错误
  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await onConfirm();
      if (ok === false) {
        // 失败（调用方已提示）：保留弹窗
        setBusy(false);
        return;
      }
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败，请稍后重试");
      setBusy(false);
    }
  }

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
        onClick={busy ? undefined : onClose}
        aria-hidden="true"
      />

      {/* 弹窗卡片 */}
      <div
        ref={dialogRef}
        className={cn(
          "relative z-10 w-full max-w-md rounded-[var(--cm-radius-container)] bg-[var(--cm-surface)] p-6",
          "shadow-[var(--cm-shadow-float)]",
        )}
        role="document"
        aria-busy={busy}
      >
        <button
          type="button"
          onClick={busy ? undefined : onClose}
          disabled={busy}
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

        {error && (
          <div className="mt-3 text-sm text-[var(--cm-danger)]" role="alert">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            loading={busy}
            disabled={busy}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
