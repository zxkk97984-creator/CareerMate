"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, X, Expand } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChatThread } from "@/components/chat/chat-thread";
import { ChatComposer } from "@/components/chat/chat-composer";
import { useAssistantControllerContext } from "@/components/chat/assistant-provider";
import { useCompanionAppearance } from "@/components/chat/companion-appearance-provider";
import { companionDisplayName } from "@/components/chat/companion-appearance-options";
import { COMPANION_POSITION_EVENT } from "@/lib/companion-geometry";
import {
  fallbackDockRect,
  PANEL_HEIGHT,
  PANEL_WIDTH,
  placePanel,
  type PanelRect,
} from "@/lib/companion-panel-geometry";

/**
 * 助手面板：复用同一控制器（单一消息状态源），用既有 Markdown/引用/候选渲染与输入组件。
 * - 桌面为跟随陪伴形象的固定宽度浮动弹窗（392px），不占据固定右侧栏；
 * - 顶部有标题、新对话、关闭（每个 icon button 带 aria-label）；
 * - Escape 关闭并回焦触发点（非模态弹窗不做 focus trap，不限制主区访问）；
 * - 手机（≤720px）为贴底抽屉：跟随 K12 placePanel，输入贴键盘上沿，消息区独立滚动。
 */
export function AssistantPanel() {
  const controller = useAssistantControllerContext();
  const { chatAppearance } = useCompanionAppearance();
  const pathname = usePathname();
  const panelRef = useRef<HTMLElement>(null);
  const [panelRect, setPanelRect] = useState<PanelRect | null>(null);
  const closePanelSafe = controller.closePanel;
  const panelOpen = controller.panelOpen;

  // 浮动弹窗跟随宠物位置：以 dock DOM 矩形计算，窗口缩放或拖拽宠物时重新落位。
  const updatePanelRect = useCallback(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const dock = document.querySelector<HTMLElement>('[data-testid="companion-dock"]');
    const dockRect = dock?.getBoundingClientRect() ?? fallbackDockRect(viewport);
    setPanelRect(placePanel(dockRect, viewport, { width: PANEL_WIDTH, height: PANEL_HEIGHT }));
  }, []);

  useEffect(() => {
    if (!panelOpen || pathname === "/chat") {
      setPanelRect(null);
      return;
    }
    updatePanelRect();
    window.addEventListener("resize", updatePanelRect);
    window.addEventListener(COMPANION_POSITION_EVENT, updatePanelRect);
    return () => {
      window.removeEventListener("resize", updatePanelRect);
      window.removeEventListener(COMPANION_POSITION_EVENT, updatePanelRect);
    };
  }, [panelOpen, pathname, updatePanelRect]);

  // 打开时记录触发点，关闭/Escape 时回焦；并监听 Escape（非模态：只关闭，不做 focus trap）
  useEffect(() => {
    if (!panelOpen) return;
    const prevActive = document.activeElement as HTMLElement | null;
    const panelEl = panelRef.current;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closePanelSafe();
        prevActive?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (panelEl && document.activeElement === panelEl) prevActive?.focus();
    };
  }, [closePanelSafe, panelOpen]);

  if (!panelOpen || pathname === "/chat" || !panelRect) return null;

  return (
    <aside
      ref={panelRef}
      className="assistant-panel assistant-panel-floating"
      id="assistant-panel"
      data-testid="assistant-panel"
      data-floating="true"
      aria-label="AI 助手"
      role="dialog"
      aria-modal="false"
      style={{ left: panelRect.left, top: panelRect.top, width: panelRect.width, height: panelRect.height }}
    >
      <header className="assistant-panel-head">
        <span className="assistant-panel-title">{companionDisplayName(chatAppearance)} · AI 助手</span>
        <div className="assistant-panel-actions">
          <Link href="/chat" aria-label="全屏对话" onClick={controller.closePanel}><Expand size={16}/></Link>
          <button type="button" aria-label="新对话" title="新对话" onClick={controller.newChat}>
            <Plus size={16} />
          </button>
          <button type="button" aria-label="关闭助手" title="关闭" onClick={controller.closePanel}>
            <X size={16} />
          </button>
        </div>
      </header>
      <div className="assistant-panel-body">
        <ChatThread
          messages={controller.messages}
          activeConversationId={controller.activeConversationId}
          onNewChat={(text) => { if (text) void controller.send(text); else controller.newChat(); }}
          openChatEntry={true}
          onQuickAction={(actionId, value) => { void controller.send(value, actionId); }}
        />
      </div>
      <div className="assistant-panel-composer">
        {controller.error && <p role="alert" className="chat-feedback">{controller.error}</p>}
        <ChatComposer
          value={controller.draft}
          onChange={controller.setDraft}
          onSend={(text) => { void controller.send(text); }}
          disabled={controller.streaming}
          activeConversationId={controller.activeConversationId}
        />
      </div>
    </aside>
  );
}
