export interface DialogPoint {
  x: number;
  y: number;
}

export interface DialogHandleRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ResolveDialogPositionInput {
  /** 用户上次保存的位置；未保存时为 null，则按人物位置自动放置。 */
  savedPos: DialogPoint | null;
  /** 对话框宽度。 */
  dialogW: number;
  /** 人物窗口矩形。 */
  rect: DialogHandleRect;
  /** 视口宽高；缺省回退到 window（客户端）或保守默认值。 */
  viewportW?: number;
  viewportH?: number;
}

export interface ResolvedDialogPosition {
  pos: DialogPoint;
  side: "left" | "right";
}

/** Kurisu 人物视觉右边缘相对窗口左侧的近似位置（Live2D 嵌入模型 240px 宽画布内的右侧）。 */
export const KURISU_RIGHT = 144;

function resolveViewport(viewportW?: number, viewportH?: number) {
  const vw =
    typeof viewportW === "number"
      ? viewportW
      : typeof window !== "undefined"
        ? window.innerWidth
        : 1440;
  const vh =
    typeof viewportH === "number"
      ? viewportH
      : typeof window !== "undefined"
        ? window.innerHeight
        : 900;
  return { vw, vh };
}

/** 把相对窗口的对话框坐标钳制到视口内（含安全边距）。 */
export function clampDialogPos(
  x: number,
  y: number,
  w: number,
  win: { x: number; y: number },
  viewportW?: number,
  viewportH?: number,
): DialogPoint {
  const { vw, vh } = resolveViewport(viewportW, viewportH);
  const minX = 8 - win.x;
  const maxX = vw - 8 - w - win.x;
  const minY = 8 - win.y;
  const maxY = Math.max(minY, vh - 80 - win.y);
  return {
    x: Math.max(minX, Math.min(Math.max(minX, maxX), x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
}

/**
 * 统一的新建对话/打开历史共享定位：优先用已保存位置，否则按人物所在侧自动放置，
 * 并始终钳制到视口内。返回的 pos 一定非空，保证对话框渲染条件是 dialogOpen && dialogPos 恒成立。
 */
export function resolveDialogPosition(input: ResolveDialogPositionInput): ResolvedDialogPosition {
  const { savedPos, dialogW, rect } = input;
  if (savedPos) {
    const pos = clampDialogPos(savedPos.x, savedPos.y, dialogW, rect, input.viewportW, input.viewportH);
    return { pos, side: savedPos.x < 0 ? "left" : "right" };
  }
  const { vw } = resolveViewport(input.viewportW, input.viewportH);
  const rightSpace = vw - (rect.x + rect.w);
  const side: "left" | "right" = rightSpace < dialogW + 16 ? "left" : "right";
  const pos =
    side === "right"
      ? { x: KURISU_RIGHT + 8, y: 20 }
      : { x: -dialogW - 12, y: 20 };
  return {
    pos: clampDialogPos(pos.x, pos.y, dialogW, rect, input.viewportW, input.viewportH),
    side,
  };
}
