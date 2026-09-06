import { describe, expect, it } from "vitest";
import { clampDialogPos, resolveDialogPosition, KURISU_RIGHT } from "./kurisu-dialog-position";

describe("resolveDialogPosition", () => {
  const rect = { x: 116, y: 158, w: 240, h: 300 };

  it("returns a non-null clamped position when no saved position exists (auto-place)", () => {
    // 该分支代表“新建对话/打开历史且从未保存过位置”，必须始终产出坐标，保证 dialogOpen && dialogPos 恒成立。
    const { pos, side } = resolveDialogPosition({ savedPos: null, dialogW: 260, rect, viewportW: 1440, viewportH: 900 });
    expect(typeof pos.x).toBe("number");
    expect(typeof pos.y).toBe("number");
    expect(side).toBe("right");
    // 右侧放不下时才左移，否则贴近人物右侧
    expect(pos.x).toBe(KURISU_RIGHT + 8);
  });

  it("restores a saved position and clamps it into the viewport", () => {
    const { pos } = resolveDialogPosition({
      savedPos: { x: 200, y: 120 },
      dialogW: 260,
      rect,
      viewportW: 1440,
      viewportH: 900,
    });
    // 合法保存位置应被保留（可能被轻微钳制），而非重置
    expect(pos.x).toBeGreaterThanOrEqual(8 - rect.x);
    expect(pos.y).toBeGreaterThanOrEqual(8 - rect.y);
  });

  it("clamps an off-screen persisted position so the dialog stays visible", () => {
    const { pos } = resolveDialogPosition({
      savedPos: { x: 20000, y: 20000 },
      dialogW: 260,
      rect,
      viewportW: 1000,
      viewportH: 900,
    });
    expect(pos.x).toBeLessThanOrEqual(1000 - 8 - 260 - rect.x);
    expect(pos.y).toBeLessThanOrEqual(900 - 80 - rect.y);
  });

  it("flips to the left side when there is no right-side room", () => {
    // 人物窗口贴近右边缘（rect.x + rect.w ≈ 视口宽），右侧放不下 260+16 宽对话框
    const { pos, side } = resolveDialogPosition({
      savedPos: null,
      dialogW: 260,
      rect: { x: 1200, y: 100, w: 240, h: 300 },
      viewportW: 1440,
      viewportH: 900,
    });
    expect(side).toBe("left");
    expect(pos.x).toBeLessThan(0);
  });

  it("falls back to a conservative viewport when window is unavailable", () => {
    const { pos } = resolveDialogPosition({ savedPos: null, dialogW: 260, rect });
    expect(typeof pos.x).toBe("number");
    expect(typeof pos.y).toBe("number");
  });
});

describe("clampDialogPos", () => {
  it("keeps a valid point inside the viewport with margins at 390px width", () => {
    // 手机视口（390x844）下，人物和对话框都不应跑出屏幕
    const rect = { x: 40, y: 400, w: 240, h: 300 };
    const pos = clampDialogPos(6000, 900, 260, rect, 390, 844);
    expect(pos.x).toBeLessThanOrEqual(390 - 8 - 260 - rect.x);
    expect(pos.y).toBeLessThanOrEqual(844 - 80 - rect.y);
  });
});
