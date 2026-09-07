import { describe, expect, it } from "vitest";
import {
  fallbackDockRect,
  PANEL_GAP,
  PANEL_HEIGHT,
  PANEL_VIEWPORT_MARGIN,
  PANEL_WIDTH,
  placePanel,
  type DockRectLike,
} from "./companion-panel-geometry";

const viewport = { width: 1440, height: 900 };

function dockRect(left: number, top: number, width = 120, height = 132): DockRectLike {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

describe("placePanel", () => {
  it("places the panel on the right side of the dock when there is room", () => {
    const rect = placePanel(dockRect(100, 100), viewport);
    expect(rect).toEqual({
      left: 100 + 120 + PANEL_GAP,
      top: 76,
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
    });
  });

  it("flips the panel to the left side when the right side would overflow", () => {
    const rect = placePanel(dockRect(1200, 500), viewport);
    expect(rect.left).toBe(1200 - PANEL_WIDTH - PANEL_GAP);
    expect(rect.top).toBe(76);
  });

  it("clamps the panel inside the viewport when neither side fits", () => {
    const rect = placePanel(dockRect(500, 500), viewport);
    expect(rect.left + rect.width).toBeLessThanOrEqual(viewport.width - PANEL_VIEWPORT_MARGIN);
    expect(rect.left).toBeGreaterThanOrEqual(PANEL_VIEWPORT_MARGIN);
    expect(rect.top + rect.height).toBeLessThanOrEqual(viewport.height - PANEL_VIEWPORT_MARGIN);
  });

  it("uses a bottom sheet on narrow viewports", () => {
    const smallViewport = { width: 700, height: 800 };
    const rect = placePanel(dockRect(500, 500), smallViewport);
    expect(rect.width).toBe(PANEL_WIDTH);
    expect(rect.height).toBe(PANEL_HEIGHT);
    expect(rect.left).toBe(PANEL_VIEWPORT_MARGIN);
    expect(rect.top).toBe(800 - PANEL_HEIGHT - PANEL_VIEWPORT_MARGIN);
  });

  it("honors an explicit expanded size while keeping the panel visible", () => {
    const rect = placePanel(dockRect(300, 300), viewport, { width: 760, height: 640 });
    expect(rect.width).toBe(760);
    expect(rect.left + rect.width).toBeLessThanOrEqual(viewport.width - PANEL_VIEWPORT_MARGIN);
  });
});

describe("fallbackDockRect", () => {
  it("derives a bottom-right dock rect from the default dock position", () => {
    const rect = fallbackDockRect(viewport);
    expect(rect.right).toBeGreaterThan(viewport.width / 2);
    expect(rect.bottom).toBeLessThanOrEqual(viewport.height);
  });
});
