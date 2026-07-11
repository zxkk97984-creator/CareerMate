"use client";

import { useCallback, useRef, useState } from "react";
import { Send, Square } from "lucide-react";

interface ChatComposerProps {
  onSend: (text: string) => void;
  disabled: boolean;
  activeConversationId: string | null;
}

export function ChatComposer({ onSend, disabled }: ChatComposerProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 8000) return;
    onSend(trimmed);
    setText("");
    // 重置高度
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, []);

  return (
    <div className="chat-composer">
      <div className="composer-wrapper">
        <textarea
          ref={textareaRef}
          className="composer-input"
          value={text}
          onChange={(e) => { setText(e.target.value); handleInput(); }}
          onKeyDown={handleKeyDown}
          placeholder="输入你的问题，Enter 发送，Shift+Enter 换行"
          rows={1}
          maxLength={8000}
          disabled={disabled}
          aria-label="输入消息"
        />
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={!text.trim() || disabled || text.trim().length > 8000}
          aria-label={disabled ? "停止生成" : "发送消息"}
        >
          {disabled ? <Square size={18} /> : <Send size={18} />}
        </button>
      </div>
      <p className="composer-hint">
        {text.length > 0 && `${text.length}/8000 `}
        CareerMate 的回答仅供参考，不构成职业建议
      </p>
    </div>
  );
}
