import { describe, expect, it } from "vitest";
import {
  clampDock,
  defaultDockPosition,
  DOCK_BOTTOM_CLEARANCE,
  DOCK_BOTTOM_CLEARANCE_NARROW,
  DOCK_DRAG_THRESHOLD,
  DOCK_HEIGHT,
  DOCK_MARGIN,
  DOCK_WIDTH,
} from "./companion-geometry";

const viewport = { width: 1440, height: 900 };

describe("companion dock geometry", () => {
  it("keeps the dock fully inside the viewport", () => {
    expect(clampDock(-100, -100, viewport)).toEqual({ x: DOCK_MARGIN, y: DOCK_MARGIN });
    const far = clampDock(99999, 99999, viewport);
    expect(far.x + DOCK_WIDTH).toBeLessThanOrEqual(viewport.width - DOCK_MARGIN);
    expect(far.y + DOCK_HEIGHT).toBeLessThanOrEqual(viewport.height - DOCK_MARGIN);
  });

  it("defaults to the bottom-right corner above the composer", () => {
    const pos = defaultDockPosition(viewport);
    expect(pos.x).toBe(viewport.width - DOCK_WIDTH - 24);
    expect(pos.y).toBe(viewport.height - DOCK_HEIGHT - DOCK_BOTTOM_CLEARANCE);
  });

  it("pins narrow viewports near the corner like the K12 reference", () => {
    const narrow = defaultDockPosition({ width: 1024, height: 680 });
    expect(narrow.y).toBe(680 - DOCK_HEIGHT - DOCK_BOTTOM_CLEARANCE_NARROW);
  });

  it("uses a small threshold so a click is not mistaken for a drag", () => {
    expect(DOCK_DRAG_THRESHOLD).toBe(5);
  });
});
