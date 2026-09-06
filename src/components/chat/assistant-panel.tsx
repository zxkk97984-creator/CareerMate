"use client";

import { useEffect, useRef } from "react";
import { PanelRightOpen, Plus, X } from "lucide-react";
import { ChatThread } from "@/components/chat/chat-thread";
import { ChatComposer } from "@/components/chat/chat-composer";
import { useAssistantControllerContext } from "@/components/chat/assistant-provider";

/**
 * 助手面板：复用同一控制器（单一消息状态源），用既有 Markdown/引用/候选渲染与输入组件。
 * - 桌面右侧面板宽 420px（窄桌面不硬挤业务内容），可“展开阅读”到 760px；
 * - 顶部有标题、新对话、关闭（每个 icon button 带 aria-label）；
 * - Escape 关闭并回焦触发点（非模态侧面板不做 focus trap，不限制主区访问）；
 * - 手机（≤767px）为全屏 sheet：100dvh + safe-area，输入贴键盘上沿，消息区独立滚动。
 */
export function AssistantPanel() {
  const controller = useAssistantControllerContext();
  const panelRef = useRef<HTMLElement>(null);
  const closePanelSafe = controller.closePanel;
  const panelOpen = controller.panelOpen;

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

  if (!panelOpen) return null;

  const width = controller.expanded ? 760 : 420;

  return (
    <aside
      ref={panelRef}
      className="assistant-panel"
      data-testid="assistant-panel"
      data-expanded={controller.expanded}
      aria-label="AI 助手"
      style={{ width }}
    >
      <header className="assistant-panel-head">
        <span className="assistant-panel-title">AI 助手</span>
        <div className="assistant-panel-actions">
          <button type="button" aria-label="展开阅读" title={controller.expanded ? "收起" : "展开阅读"} onClick={controller.toggleExpanded}>
            <PanelRightOpen size={18} />
          </button>
          <button type="button" aria-label="新对话" title="新对话" onClick={controller.newChat}>
            <Plus size={18} />
          </button>
          <button type="button" aria-label="关闭助手" title="关闭" onClick={controller.closePanel}>
            <X size={18} />
          </button>
        </div>
      </header>
      <div className="assistant-panel-body">
        <ChatThread
          messages={controller.messages}
          activeConversationId={controller.activeConversationId}
          onNewChat={controller.newChat}
          openChatEntry={true}
          onQuickAction={(actionId, value) => { void controller.send(value); }}
        />
      </div>
      <div className="assistant-panel-composer">
        <ChatComposer
          onSend={(text) => { void controller.send(text); }}
          disabled={controller.streaming}
          activeConversationId={controller.activeConversationId}
        />
      </div>
    </aside>
  );
}
