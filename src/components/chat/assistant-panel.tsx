"use client";

import { ChatThread } from "@/components/chat/chat-thread";
import { ChatComposer } from "@/components/chat/chat-composer";
import { useAssistantControllerContext } from "@/components/chat/assistant-provider";

/**
 * 助手面板：复用同一控制器（单一消息状态源），用既有 Markdown/引用/候选渲染与输入组件。
 * 由 T06a 的 controller 提供 activeConversation/messages/stream/draft；关闭只隐藏不清草稿。
 */
export function AssistantPanel() {
  const controller = useAssistantControllerContext();

  return (
    <div className="assistant-panel" data-testid="assistant-panel" aria-label="AI 助手">
      <ChatThread
        messages={controller.messages}
        activeConversationId={controller.activeConversationId}
        onNewChat={controller.newChat}
        openChatEntry={true}
        onQuickAction={(actionId, value) => { void controller.send(value); }}
      />
      <ChatComposer
        onSend={(text) => { void controller.send(text); }}
        disabled={controller.streaming}
        activeConversationId={controller.activeConversationId}
      />
    </div>
  );
}
