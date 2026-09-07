import { DOCK_HEIGHT, DOCK_WIDTH, defaultDockPosition, type ViewportSize } from "./companion-geometry";

/** Floating assistant panel geometry. Reference implementation:
 *  K12-Learning-platform/frontend/src/features/companion/lib/geometry.ts. */

export const PANEL_WIDTH = 392;
export const PANEL_HEIGHT = 640;
export const PANEL_GAP = 16;
export const PANEL_MOBILE_BREAKPOINT = 720;
export const PANEL_VIEWPORT_MARGIN = 16;
export const PANEL_MIN_TOP = 76;

export interface PanelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The subset of DOMRect that placePanel needs; keeping it pure makes the math testable. */
export interface DockRectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface PanelSize {
  width?: number;
  height?: number;
}

/** Anchor that keeps the popup fully visible when the dock is not mounted yet. */
export function fallbackDockRect(viewport: ViewportSize): DockRectLike {
  const position = defaultDockPosition(viewport);
  return {
    left: position.x,
    top: position.y,
    right: position.x + DOCK_WIDTH,
    bottom: position.y + DOCK_HEIGHT,
    width: DOCK_WIDTH,
    height: DOCK_HEIGHT,
  };
}

/** Panel placement: right side first, flip left when it would overflow, then clamp.
 *  Viewports at or below PANEL_MOBILE_BREAKPOINT become a bottom sheet. */
export function placePanel(dockRect: DockRectLike, viewport: ViewportSize, size: PanelSize = {}): PanelRect {
  const width = Math.min(size.width ?? PANEL_WIDTH, viewport.width - PANEL_VIEWPORT_MARGIN * 2);
  const height = Math.min(size.height ?? PANEL_HEIGHT, viewport.height - PANEL_VIEWPORT_MARGIN * 2);

  if (viewport.width <= PANEL_MOBILE_BREAKPOINT) {
    return {
      left: PANEL_VIEWPORT_MARGIN,
      top: Math.max(PANEL_VIEWPORT_MARGIN, viewport.height - height - PANEL_VIEWPORT_MARGIN),
      width,
      height,
    };
  }

  let left = dockRect.right + PANEL_GAP;
  let top = dockRect.top + dockRect.height - height;
  if (left + width > viewport.width - PANEL_VIEWPORT_MARGIN && dockRect.left >= width + PANEL_GAP) {
    left = dockRect.left - width - PANEL_GAP;
  }
  if (left + width > viewport.width - PANEL_VIEWPORT_MARGIN) {
    left = Math.max(PANEL_VIEWPORT_MARGIN, viewport.width - width - PANEL_VIEWPORT_MARGIN);
  }
  if (top < PANEL_MIN_TOP) top = PANEL_MIN_TOP;
  if (top + height > viewport.height - PANEL_VIEWPORT_MARGIN) {
    top = viewport.height - height - PANEL_VIEWPORT_MARGIN;
  }
  return { left, top, width, height };
}
