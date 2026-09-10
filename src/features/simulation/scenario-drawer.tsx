'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
export function ScenarioDrawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
 const ref = useRef<HTMLDialogElement>(null);
 useEffect(() => {
  const dialog = ref.current;
  if (open && dialog && !dialog.open) dialog.showModal();
  if (!open && dialog?.open) dialog.close();
  if (!open) return;
  const previous = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  return () => { document.body.style.overflow = previous; };
 }, [open]);
 return <dialog ref={ref} className="training-drawer" onCancel={e => { e.preventDefault(); onClose(); }} aria-label={title}><header><h2>{title}</h2><button type="button" onClick={onClose} aria-label="关闭场景详情"><X size={22}/></button></header><div className="training-drawer-body">{children}</div></dialog>;
}
