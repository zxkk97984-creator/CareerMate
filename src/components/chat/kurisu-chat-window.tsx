"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConversationItem } from "@/lib/chat/schemas";
import { Plus, X } from "lucide-react";
import { consumeFrontendSseResponse } from "@/lib/tbox/frontend-sse";

interface WindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEFAULT_RECT: WindowRect = { x: 116, y: 158, w: 240, h: 300 };
const POSITION_KEY = "kurisu-window-pos.v1";
const SIZE_KEY = "kurisu-window-size.v1";
const DIALOG_POS_KEY = "kurisu-dialog-pos.v2";
const DIALOG_SIZE_KEY = "kurisu-dialog-size.v2";
// 角色视觉右边缘相对窗口左侧的近似位置（Live2D 嵌入模型 240px 宽画布内的右侧）
const KURISU_RIGHT = 144;

function loadRect(): WindowRect {
  let pos = DEFAULT_RECT;
  let size = DEFAULT_RECT;
  try {
    const rawPos = localStorage.getItem(POSITION_KEY);
    if (rawPos) {
      const parsed = JSON.parse(rawPos) as Partial<WindowRect>;
      pos = { ...DEFAULT_RECT, ...parsed };
    }
    const rawSize = localStorage.getItem(SIZE_KEY);
    if (rawSize) {
      const parsed = JSON.parse(rawSize) as Partial<WindowRect>;
      size = { ...DEFAULT_RECT, ...parsed };
    }
  } catch {
    // localStorage 不可用时使用默认值
  }
  return {
    ...pos,
    w: Math.max(200, Math.min(420, size.w)),
    h: Math.max(220, Math.min(520, size.h)),
  };
}

function loadDialogPos(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(DIALOG_POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<{ x: number; y: number }>;
    if (typeof parsed.x === "number" && typeof parsed.y === "number") {
      return { x: parsed.x, y: parsed.y };
    }
  } catch {}
  return null;
}

function loadDialogSize(): { w: number; h: number | null } {
  try {
    const raw = localStorage.getItem(DIALOG_SIZE_KEY);
    if (!raw) return { w: 260, h: null };
    const parsed = JSON.parse(raw) as Partial<{ w: number; h: number | null }>;
    return {
      w: typeof parsed.w === "number" ? Math.max(200, Math.min(420, parsed.w)) : 260,
      h: typeof parsed.h === "number" ? Math.max(180, Math.min(520, parsed.h)) : null,
    };
  } catch {}
  return { w: 260, h: null };
}

function clampDialogPos(
  x: number,
  y: number,
  w: number,
  win: { x: number; y: number },
): { x: number; y: number } {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
  const vh = typeof window !== "undefined" ? window.innerHeight : 900;
  const minX = 8 - win.x;
  const maxX = vw - 8 - w - win.x;
  const minY = 8 - win.y;
  const maxY = Math.max(minY, vh - 80 - win.y);
  return {
    x: Math.max(minX, Math.min(Math.max(minX, maxX), x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
}

/** Kurisu 悬浮聊天窗：全局可用的 AI 对话入口，不依赖主聊天页 */
export function KurisuChatWindow() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const dragRef = useRef<{ offsetX: number; offsetY: number; pointerId: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; w: number; h: number } | null>(null);
  const dialogDragRef = useRef<{ offsetX: number; offsetY: number; pointerId: number } | null>(null);
  const dialogResizeRef = useRef<{ startX: number; startY: number; w: number; h: number } | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevPhaseRef = useRef<"idle" | "waiting" | "speaking">("idle");

  const [rect, setRect] = useState<WindowRect>(DEFAULT_RECT);
  const [modelReady, setModelReady] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSide, setDialogSide] = useState<"left" | "right">("right");
  const [dialogPos, setDialogPos] = useState<{ x: number; y: number } | null>(null);
  const [dialogSize, setDialogSize] = useState<{ w: number; h: number | null }>(loadDialogSize);
  const [draft, setDraft] = useState("");
  const [localMessages, setLocalMessages] = useState<{ role: "user" | "assistant"; content: string; id?: string }[]>([]);
  const [localStreaming, setLocalStreaming] = useState(false);
  const [localPhase, setLocalPhase] = useState<"idle" | "waiting" | "speaking">("idle");
  const localCidRef = useRef<string | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // 首次挂载后再读取保存的窗口位置，避免服务端/客户端初始状态不一致导致人物瞬移
  useEffect(() => {
    setRect(loadRect());
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversations?limit=30");
      if (!res.ok) return;
      const body = await res.json();
      if (body.ok) setConversations(body.data.items);
    } catch {}
  }, []);

  const loadConversationMessages = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/chat/conversations/${id}/messages?limit=50`);
      if (!res.ok) return;
      const body = await res.json();
      if (body.ok) {
        const items = (body.data as Array<{ role: string; content: string }>).filter(
          (m) => m.role === "user" || m.role === "assistant",
        );
        setLocalMessages(items.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })));
        setActiveConversationId(id);
        localCidRef.current = id;
        setDialogOpen(true);
        setHistoryOpen(false);
        setMenu(null);
      }
    } catch {}
  }, []);

  useEffect(() => { void loadConversations(); }, [loadConversations]);

  // 清理轮询
  useEffect(() => () => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
  }, []);

  // 模型就绪轮询：组件挂载后就开始，直到模型就绪
  useEffect(() => {
    if (modelReady) return;
    pollTimerRef.current = setInterval(() => {
      const win = iframeRef.current?.contentWindow as (Window & { __kurisuReady?: boolean }) | null;
      if (win?.__kurisuReady === true) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
        setModelReady(true);
      }
    }, 250);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    };
  }, [modelReady]);

  // 对话阶段 → Kurisu 动作
  useEffect(() => {
    if (!modelReady) return;
    const win = iframeRef.current?.contentWindow as (Window & {
      kurisuSetTalking?: (active: boolean) => void;
      kurisuPlayMotion?: (name: string) => void;
      clearExpression?: () => void;
    }) | null;
    if (!win) return;

    const activePhase = localPhase;
    if (activePhase === "waiting") {
      win.kurisuSetTalking?.(false);
      if (prevPhaseRef.current !== "waiting") {
        win.kurisuPlayMotion?.("thinking");
      }
    } else if (activePhase === "speaking") {
      if (prevPhaseRef.current === "waiting") {
        win.clearExpression?.();
      }
      win.kurisuSetTalking?.(true);
    } else if (prevPhaseRef.current === "speaking") {
      win.kurisuSetTalking?.(false);
      win.clearExpression?.();
      win.kurisuPlayMotion?.("mtn_01");
    }

    prevPhaseRef.current = activePhase;
  }, [localPhase, modelReady]);


  // 拖动窗口
  const onHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    dragRef.current = { offsetX: e.clientX - rect.x, offsetY: e.clientY - rect.y, pointerId: e.pointerId };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, [rect.x, rect.y]);

  const onHeaderPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
    const nextX = Math.max(8, Math.min(window.innerWidth - 64, e.clientX - dragRef.current.offsetX));
    const nextY = Math.max(8, Math.min(window.innerHeight - 48, e.clientY - dragRef.current.offsetY));
    setRect(prev => {
      const next = { ...prev, x: nextX, y: nextY };
      try { localStorage.setItem(POSITION_KEY, JSON.stringify({ x: next.x, y: next.y })); } catch {}
      return next;
    });
  }, []);

  const onHeaderPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  }, []);

  // 调整窗口大小
  const onResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, w: rect.w, h: rect.h };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, [rect.w, rect.h]);

  const onResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) return;
    const w = Math.max(200, Math.min(420, resizeRef.current.w + (e.clientX - resizeRef.current.startX)));
    const h = Math.max(220, Math.min(520, resizeRef.current.h + (e.clientY - resizeRef.current.startY)));
    setRect(prev => {
      const next = { ...prev, w, h };
      try { localStorage.setItem(SIZE_KEY, JSON.stringify({ w: next.w, h: next.h })); } catch {}
      return next;
    });
  }, []);

  const onResizePointerUp = useCallback(() => {
    resizeRef.current = null;
  }, []);

  // 右键菜单：固定在克里斯右边（相对窗口坐标）
  const openMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setHistoryOpen(false);
    const menuWidth = 190;
    const x = Math.min(KURISU_RIGHT + 8, window.innerWidth - rect.x - menuWidth - 12);
    const y = Math.min(24, Math.max(8, window.innerHeight - rect.y - 260));
    setMenu({ x, y });
  }, [rect.x, rect.y, rect.w]);

  const closeMenu = useCallback(() => setMenu(null), []);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setHistoryOpen(false);
    // 关闭时把当前对话框位置和大小保存下来
    try {
      if (dialogPos) localStorage.setItem(DIALOG_POS_KEY, JSON.stringify(dialogPos));
      localStorage.setItem(DIALOG_SIZE_KEY, JSON.stringify({ w: dialogSize.w, h: dialogSize.h }));
    } catch {}
  }, [dialogPos, dialogSize]);

  // 仅当右侧空间放不下对话框时才平移到左侧，避免过早判定
  const nearRightEdge =
    typeof window !== "undefined" &&
    rect.x + rect.w + dialogSize.w + 16 > window.innerWidth;

  const openDialog = useCallback(() => {
    // 开始新对话：清空当前对话内容，不再依赖主聊天页
    setLocalMessages([]);
    localCidRef.current = null;
    setActiveConversationId(null);
    setDraft("");
    // 优先使用上次调整好的位置；没有保存过才按人物位置自动放置
    const savedPos = loadDialogPos();
    let pos: { x: number; y: number };
    if (savedPos) {
      pos = clampDialogPos(savedPos.x, savedPos.y, dialogSize.w, rect);
      setDialogSide(savedPos.x < 0 ? "left" : "right");
    } else {
      const rightSpace = window.innerWidth - (rect.x + rect.w);
      const side = rightSpace < dialogSize.w + 16 ? "left" : "right";
      setDialogSide(side);
      pos = side === "right"
        ? { x: KURISU_RIGHT + 8, y: 20 }
        : { x: -dialogSize.w - 12, y: 20 };
      pos = clampDialogPos(pos.x, pos.y, dialogSize.w, rect);
    }
    setDialogPos(pos);
    try { localStorage.setItem(DIALOG_POS_KEY, JSON.stringify(pos)); } catch {}
    setDialogOpen(true);
    setHistoryOpen(false);
    setMenu(null);
  }, [rect.x, rect.y, rect.w, dialogSize.w]);

  // 对话框拖动
  const onDialogHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    if (!dialogPos) return;
    e.preventDefault();
    dialogDragRef.current = {
      offsetX: e.clientX - rect.x - dialogPos.x,
      offsetY: e.clientY - rect.y - dialogPos.y,
      pointerId: e.pointerId,
    };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, [dialogPos, rect.x, rect.y]);

  const onDialogHeaderPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dialogDragRef.current || dialogDragRef.current.pointerId !== e.pointerId) return;
    const rawX = e.clientX - rect.x - dialogDragRef.current.offsetX;
    const rawY = e.clientY - rect.y - dialogDragRef.current.offsetY;
    const next = clampDialogPos(rawX, rawY, dialogSize.w, rect);
    setDialogPos(next);
    try { localStorage.setItem(DIALOG_POS_KEY, JSON.stringify(next)); } catch {}
  }, [dialogSize.w, rect.x, rect.y]);

  const onDialogHeaderPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dialogDragRef.current?.pointerId === e.pointerId) dialogDragRef.current = null;
  }, []);

  // 对话框缩放
  const onDialogResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dialogResizeRef.current = { startX: e.clientX, startY: e.clientY, w: dialogSize.w, h: dialogSize.h ?? 220 };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, [dialogSize.w, dialogSize.h]);

  const onDialogResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dialogResizeRef.current) return;
    const w = Math.max(200, Math.min(420, dialogResizeRef.current.w + (e.clientX - dialogResizeRef.current.startX)));
    const h = Math.max(180, Math.min(520, dialogResizeRef.current.h + (e.clientY - dialogResizeRef.current.startY)));
    setDialogSize({ w, h });
    try { localStorage.setItem(DIALOG_SIZE_KEY, JSON.stringify({ w, h })); } catch {}
  }, []);

  const onDialogResizePointerUp = useCallback(() => {
    dialogResizeRef.current = null;
  }, []);

  // 任意点击/交互都会让历史面板消失
  useEffect(() => {
    if (!menu && !historyOpen) return;
    const closeAll = (e: Event) => {
      const target = e.target as HTMLElement | null;
      const insideMenu = target?.closest?.(".kurisu-context-menu");
      const insideHistory = target?.closest?.(".kurisu-history-panel");
      if (insideMenu) return;
      if (insideHistory) return;
      setMenu(null);
      setHistoryOpen(false);
    };
    window.addEventListener("pointerdown", closeAll);
    window.addEventListener("click", closeAll);
    return () => {
      window.removeEventListener("pointerdown", closeAll);
      window.removeEventListener("click", closeAll);
    };
  }, [menu, historyOpen]);

  // 在 Kurisu 自己的对话框里直接发送，不跳到主聊天界面
  const sendLocalMessage = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || localStreaming) return;
    setDraft("");
    setLocalMessages(prev => [...prev, { role: "user", content }]);
    setLocalStreaming(true);
    setLocalPhase("waiting");

    try {
      let cid = localCidRef.current;
      if (!cid) {
        const res = await fetch("/api/chat/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          if (res.status === 401) {
            setLocalMessages(prev => [...prev, { role: "assistant", content: "请先登录后再和 Kurisu 对话。" }]);
          }
          return;
        }
        const body = await res.json();
        if (!body.ok || !body.data?.id) return;
        cid = body.data.id as string;
        localCidRef.current = cid;
      }

      const response = await fetch(`/api/chat/conversations/${cid}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          clientRequestId: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
          interaction: { surface: "chat", action: "message_submit" },
        }),
      });

      if (!response.ok || !response.body) {
        setLocalMessages(prev => [...prev, { role: "assistant", content: "发送失败，请稍后重试" }]);
        return;
      }

      let assistantContent = "";
      const assistantId = "kurisu-local-" + Date.now();
      setLocalMessages(prev => [...prev, { role: "assistant", content: "", id: assistantId }]);

      await consumeFrontendSseResponse(response, {
        onDelta(delta) {
          setLocalPhase("speaking");
          assistantContent += delta;
          setLocalMessages(prev => prev.map(m => (m as any).id === assistantId ? { ...m, content: assistantContent } : m));
        },
        onArtifact() {
          // Kurisu 弹窗对话框只展示文字，结构卡片留在主聊天界面
        },
      });

      setLocalMessages(prev => prev.map(m => (m as any).id === assistantId ? { ...m, content: assistantContent } : m));
    } catch {
      setLocalMessages(prev => [...prev, { role: "assistant", content: "网络异常，请稍后重试" }]);
    } finally {
      setLocalStreaming(false);
      setLocalPhase("idle");
    }
  }, [localStreaming]);


  return (
    <div
      className="kurisu-window"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      onContextMenu={openMenu}
      role="dialog"
      aria-label="Kurisu AI 助手"
    >
      {/* 对话框：位置固定，大小可缩放，右上角可关闭 */}
      {dialogOpen && dialogPos && (() => {
        const basePos = nearRightEdge
          ? { x: -dialogSize.w - 12, y: dialogPos.y }
          : dialogPos;
        const displayPos = clampDialogPos(basePos.x, basePos.y, dialogSize.w, rect);
        return (
        <div
          className="kurisu-dialog-panel"
          style={{ left: displayPos.x, top: displayPos.y, width: dialogSize.w, height: dialogSize.h ?? "auto" }}
        >
          <div
            className="kurisu-dialog-head"
            onPointerDown={onDialogHeaderPointerDown}
            onPointerMove={onDialogHeaderPointerMove}
            onPointerUp={onDialogHeaderPointerUp}
          >
            <span className="kurisu-dialog-title">与 Kurisu 对话</span>
            <button
              type="button"
              className="kurisu-dialog-close"
              aria-label="关闭对话"
              onClick={(e) => { e.stopPropagation(); closeDialog(); }}
            >
              <X size={12} />
            </button>
          </div>
          <div className="kurisu-dialog-body">
            <div className="kurisu-dialog-messages">
              {localMessages.length === 0 && <p className="kurisu-dialog-empty">开始和 Kurisu 对话</p>}
              {localMessages.map((m, i) => (
                <p key={i} className={`kurisu-dialog-msg kurisu-dialog-${m.role}`}>{m.content}</p>
              ))}
              {localStreaming && (
                <p className="kurisu-dialog-msg kurisu-dialog-assistant">正在思考…</p>
              )}
            </div>
            <form
              className="kurisu-dialog-form"
              onSubmit={(e) => {
                e.preventDefault();
                sendLocalMessage(draft);
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="输入消息..."
                aria-label="输入消息"
              />
              <button
                type="submit"
                disabled={localStreaming || !draft.trim()}
              >
                发送
              </button>
            </form>
          </div>
          <div
            className="kurisu-dialog-resize"
            onPointerDown={onDialogResizePointerDown}
            onPointerMove={onDialogResizePointerMove}
            onPointerUp={onDialogResizePointerUp}
            aria-hidden="true"
          />
        </div>
        );
      })()}

      {/* Live2D 人物：保留人物，背景透明；hitbox 放在人物上 */}
      <div className="kurisu-window-stage">
        <iframe
          ref={iframeRef}
          className="kurisu-window-frame"
          src="/live2d/index.html"
          title="Kurisu Live2D"
          tabIndex={-1}
          onError={() => setIframeError(true)}
        />
        {!modelReady && !iframeError ? (
          <div className="kurisu-loading" aria-live="polite">Kurisu 加载中…</div>
        ) : null}
        {iframeError ? (
          <div className="kurisu-loading" aria-live="polite">Kurisu 暂时不可用</div>
        ) : null}
        <div
          className="kurisu-hitbox"
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onContextMenu={openMenu}
          aria-label="拖动 Kurisu 或右键菜单"
        />
      </div>

      {/* 运行信息 */}
      {dialogOpen && (
        <div className="kurisu-runstats">
          <span>Kurisu 对话</span>
          <span>{localMessages.length} 条消息</span>
        </div>
      )}

      {/* 历史会话面板 */}
      {historyOpen && (
        <div className="kurisu-history-panel" onClick={(e) => e.stopPropagation()}>
          <div className="kurisu-history-head">
            <span>会话历史</span>
            <button
              type="button"
              aria-label="关闭历史"
              onClick={() => setHistoryOpen(false)}
            >
              <X size={12} />
            </button>
          </div>
          <div className="kurisu-history-list">
            {conversations.length === 0 && <p className="kurisu-history-empty">暂无会话</p>}
            {conversations.slice(0, 12).map(c => (
              <button
                key={c.id}
                type="button"
                className={`kurisu-history-item ${c.id === activeConversationId ? "kurisu-history-item-active" : ""}`}
                onClick={() => { void loadConversationMessages(c.id); setHistoryOpen(false); }}
              >
                <span className="kurisu-history-title">{c.title || "新对话"}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 右键菜单 */}
      {menu && (
        <div
          className="kurisu-context-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="kurisu-menu-item"
            onClick={() => { closeMenu(); openDialog(); }}
          >
            <Plus size={13} /> 对话
          </button>
          <button
            type="button"
            className="kurisu-menu-item"
            onClick={() => { setHistoryOpen(true); setMenu(null); }}
          >
            历史对话
          </button>
          <div className="kurisu-menu-divider" />
          <div className="kurisu-menu-label">最近会话</div>
          <div className="kurisu-menu-list">
            {conversations.length === 0 && <div className="kurisu-menu-empty">暂无会话</div>}
            {conversations.slice(0, 6).map(c => (
              <button
                key={c.id}
                type="button"
                className={`kurisu-menu-item ${c.id === activeConversationId ? "kurisu-menu-item-active" : ""}`}
                onClick={() => { closeMenu(); void loadConversationMessages(c.id); }}
              >
                <span className="kurisu-menu-title">{c.title || "新对话"}</span>
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
