"use client";

import { Bot } from "lucide-react";
import { useAssistantControllerContext } from "@/components/chat/assistant-provider";

/**
 * 显式“AI 助手”入口：所有工作台页头常驻，点击打开同一助手面板（共享 T06a 控制器）。
 * 普通点击、Tab+Enter、触摸均可用（原生 button）。角色点击由 Kurisu 侧同样调用 openPanel。
 */
export function AssistantEntryButton() {
  const controller = useAssistantControllerContext();
  return (
    <button
      type="button"
      className="assistant-entry-btn"
      onClick={controller.openPanel}
      aria-label="AI 助手"
      aria-controls="assistant-panel"
      style={{ minHeight: 44, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 14px", borderRadius: "var(--cm-radius-control)", border: "1px solid var(--cm-border-strong)", background: "var(--cm-surface)", color: "var(--cm-text-strong)", cursor: "pointer", fontWeight: 600 }}
    >
      <Bot size={16} aria-hidden="true" />
      打开 AI 助手
    </button>
  );
}
