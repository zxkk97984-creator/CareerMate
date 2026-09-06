"use client";

import { PanelRightOpen, Plus, X } from "lucide-react";
import { ChatThread } from "@/components/chat/chat-thread";
import { ChatComposer } from "@/components/chat/chat-composer";
import { useAssistantControllerContext } from "@/components/chat/assistant-provider";

/**
 * 助手面板：复用同一控制器（单一消息状态源），用既有 Markdown/引用/候选渲染与输入组件。
 * - 桌面右侧面板宽 420px（窄桌面不硬挤业务内容），可“展开阅读”到 760px；
 * - 顶部有标题、当前会话、新对话、关闭（每个 icon button 带 aria-label）；
 * - 关闭只隐藏不清草稿；新对话不删除旧会话。
 */
export function AssistantPanel() {
  const controller = useAssistantControllerContext();
  if (!controller.panelOpen) return null;

  const width = controller.expanded ? 760 : 420;

  return (
    <aside
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
