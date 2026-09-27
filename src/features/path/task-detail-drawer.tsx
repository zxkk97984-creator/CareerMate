"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** The native modal makes the background inert; Tab stays within its controls. */
export function TaskDetailDrawer({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropPointerDown = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => {
      dialog.close();
      trigger?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="path-detail-drawer"
      aria-labelledby="path-detail-heading"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], select:not(:disabled), [tabindex="0"]',
        )).filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onPointerDown={(event) => { backdropPointerDown.current = event.target === event.currentTarget; }}
      onClick={(event) => {
        if (backdropPointerDown.current && event.target === event.currentTarget) onClose();
        backdropPointerDown.current = false;
      }}
    >
      <div className="path-detail-panel">
        <header className="path-detail-header">
          <h2 id="path-detail-heading">任务详情</h2>
          <button type="button" onClick={onClose} aria-label="关闭任务详情"><X size={20} /></button>
        </header>
        <div className="path-detail-body">{children}</div>
      </div>
    </dialog>
  );
}
