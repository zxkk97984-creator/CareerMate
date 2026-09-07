/** Floating AI companion geometry. Reference implementation:
 *  K12-Learning-platform/frontend/src/features/companion/lib/geometry.ts. */
export interface Point { x: number; y: number; }
export interface ViewportSize { width: number; height: number; }

export const DOCK_WIDTH = 120;
export const DOCK_HEIGHT = 132;
export const DOCK_MARGIN = 12;
export const DOCK_BOTTOM_CLEARANCE = 200;
export const DOCK_BOTTOM_CLEARANCE_NARROW = 16;
export const DOCK_NARROW_VIEWPORT_WIDTH = 1280;
export const DOCK_DRAG_THRESHOLD = 5;
export const DOCK_KEYBOARD_STEP = 24;
export const COMPANION_POSITION_KEY = "careermate-companion-position";
/** Window event emitted whenever the dock moves, so an open panel can follow it. */
export const COMPANION_POSITION_EVENT = "careermate:companion-position";

export function clampDock(x: number, y: number, viewport: ViewportSize): Point {
  const maxX = Math.max(DOCK_MARGIN, viewport.width - DOCK_WIDTH - DOCK_MARGIN);
  const maxY = Math.max(DOCK_MARGIN, viewport.height - DOCK_HEIGHT - DOCK_MARGIN);
  return {
    x: Math.min(Math.max(DOCK_MARGIN, x), maxX),
    y: Math.min(Math.max(DOCK_MARGIN, y), maxY),
  };
}

/** Default position: bottom-right but above the composer so the user can move it freely. */
export function defaultDockPosition(viewport: ViewportSize): Point {
  const clearance = viewport.width < DOCK_NARROW_VIEWPORT_WIDTH
    ? DOCK_BOTTOM_CLEARANCE_NARROW
    : DOCK_BOTTOM_CLEARANCE;
  return clampDock(
    viewport.width - DOCK_WIDTH - 24,
    viewport.height - DOCK_HEIGHT - clearance,
    viewport,
  );
}

export function loadDockPosition(viewport: ViewportSize): Point {
  if (typeof window === "undefined") return defaultDockPosition(viewport);
  try {
    const raw = window.localStorage.getItem(COMPANION_POSITION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Point>;
      if (typeof parsed.x === "number" && typeof parsed.y === "number") {
        return clampDock(parsed.x, parsed.y, viewport);
      }
    }
  } catch {
    // Corrupt or unavailable storage falls back to the default position.
  }
  return defaultDockPosition(viewport);
}

export function persistDockPosition(position: Point): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COMPANION_POSITION_KEY, JSON.stringify(position));
  } catch {
    // Keep the in-session position even when storage is unavailable.
  }
}
