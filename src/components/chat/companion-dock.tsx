"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CompanionSprite } from "./companion-sprite";
import { KurisuAvatar } from "./kurisu-avatar";
import { useAssistantControllerContext } from "./assistant-provider";
import { useCompanionAppearance } from "./companion-appearance-provider";
import { getCompanionPet } from "@/lib/companion-pets";
import { companionFrames, companionState } from "@/lib/companion-sprite";
import {
  COMPANION_POSITION_EVENT,
  defaultDockPosition,
  DOCK_HEIGHT,
  DOCK_WIDTH,
  loadDockPosition,
  type Point,
} from "@/lib/companion-geometry";
import { useCompanionDrag } from "@/hooks/use-companion-drag";

function focusChatComposer() {
  const input = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="输入消息"]');
  input?.focus();
}

/** Global draggable AI companion shown on every logged-in page, including the primary chat.
 *  Clicking it opens the shared floating assistant popup (or focuses the composer on /chat). */
export function CompanionDock() {
  const pathname = usePathname();
  const controller = useAssistantControllerContext();
  const { appearance, chatAppearance, setAppearance } = useCompanionAppearance();
  const [position, setPosition] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const movedRef = useRef(false);

  useEffect(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    setPosition(loadDockPosition(viewport));
  }, []);

  const onPositionChange = useCallback((next: Point) => {
    setPosition(next);
    window.dispatchEvent(new CustomEvent(COMPANION_POSITION_EVENT, { detail: next }));
  }, []);
  const drag = useCompanionDrag(position ?? defaultDockPosition({ width: 1280, height: 720 }), onPositionChange);
  const state = companionState(controller.phase, controller.draft, controller.error);
  const label = companionFrames[state].label;
  const pet = getCompanionPet(appearance);
  const dockName = appearance === "kurisu" ? "Kurisu" : pet.name;

  if (pathname === "/" || pathname === "/login" || pathname === "/onboarding" || !position) return null;

  const handleDockClick = () => {
    const wasDrag = movedRef.current;
    movedRef.current = false;
    if (wasDrag) return;
    if (pathname === "/chat") focusChatComposer();
    else controller.togglePanel();
  };

  return (
    <div
      className="companion-dock"
      data-testid="companion-dock"
      style={{ left: position.x, top: position.y, width: DOCK_WIDTH, height: DOCK_HEIGHT }}
      data-appearance={appearance}
      data-dragging={dragging}
    >
      {appearance === "off" ? (
        <button
          type="button"
          className="companion-dock-restore"
          aria-label="打开 AI 陪伴形象"
          onClick={() => { setAppearance(chatAppearance); }}
        >AI</button>
      ) : (
        <div className="companion-dock-card">
          <button
            type="button"
            className="companion-dock-toggle"
            data-companion-toggle
            aria-label={`${dockName} · ${label}`}
            onClick={handleDockClick}
            onPointerDown={(event) => {
              movedRef.current = false;
              drag.handlePointerDown(event);
            }}
            onPointerMove={(event) => {
              drag.handlePointerMove(event);
              movedRef.current = drag.wasDragged();
              setDragging(movedRef.current);
            }}
            onPointerUp={() => {
              movedRef.current = drag.wasDragged();
              drag.handlePointerUp();
              setDragging(false);
            }}
            onPointerCancel={() => { drag.handlePointerCancel(); movedRef.current = false; setDragging(false); }}
            onKeyDown={drag.handleKeyDown}
          >
            <span className="companion-dock-status" role="status">{label}</span>
            <span className="companion-dock-figure">
              {appearance === "kurisu"
                ? <KurisuAvatar phase={controller.phase} streaming={controller.streaming}/>
                : <CompanionSprite state={state} width={104} petId={appearance}/>}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
