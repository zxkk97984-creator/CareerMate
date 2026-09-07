"use client";

import { useCallback, useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  clampDock,
  DOCK_DRAG_THRESHOLD,
  DOCK_KEYBOARD_STEP,
  persistDockPosition,
  type Point,
} from "@/lib/companion-geometry";

interface DragState {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
}

export function useCompanionDrag(position: Point, onPositionChange: (next: Point) => void) {
  const dragRef = useRef<DragState | null>(null);
  const positionRef = useRef(position);

  useEffect(() => { positionRef.current = position; }, [position]);

  useEffect(() => {
    const onResize = () => {
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const next = clampDock(positionRef.current.x, positionRef.current.y, viewport);
      positionRef.current = next;
      onPositionChange(next);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [onPositionChange]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: positionRef.current.x,
      originY: positionRef.current.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || !dragRef.current) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) > DOCK_DRAG_THRESHOLD) {
      drag.moved = true;
    }
    if (!drag.moved) return;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const next = clampDock(drag.originX + dx, drag.originY + dy, viewport);
    positionRef.current = next;
    onPositionChange(next);
  }, [onPositionChange]);

  const handlePointerUp = useCallback(() => {
    const drag = dragRef.current;
    if (drag?.moved) persistDockPosition(positionRef.current);
    dragRef.current = null;
  }, []);

  const handlePointerCancel = useCallback(() => {
    dragRef.current = null;
  }, []);

  /** Whether the current pointer gesture crossed the drag threshold. */
  const wasDragged = useCallback(() => dragRef.current?.moved ?? false, []);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const movement: Partial<Record<string, Point>> = {
      ArrowLeft: { x: -DOCK_KEYBOARD_STEP, y: 0 },
      ArrowRight: { x: DOCK_KEYBOARD_STEP, y: 0 },
      ArrowUp: { x: 0, y: -DOCK_KEYBOARD_STEP },
      ArrowDown: { x: 0, y: DOCK_KEYBOARD_STEP },
    };
    const delta = movement[event.key];
    if (!delta) return;
    event.preventDefault();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const next = clampDock(positionRef.current.x + delta.x, positionRef.current.y + delta.y, viewport);
    positionRef.current = next;
    onPositionChange(next);
    persistDockPosition(next);
  }, [onPositionChange]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    wasDragged,
    handleKeyDown,
  };
}
