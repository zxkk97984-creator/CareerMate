"use client";

import { useCallback, useRef, useState } from "react";
import gsap from "gsap";
import { Send, Square } from "lucide-react";
import { useMotionSafe } from "@/lib/motion/motion-safe";

interface ChatComposerProps {
  onSend: (text: string) => void;
  disabled: boolean;
  activeConversationId: string | null;
}

export function ChatComposer({ onSend, disabled }: ChatComposerProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendBtnRef = useRef<HTMLButtonElement>(null);
  const motionSafe = useMotionSafe();

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 8000) return;
    onSend(trimmed);
    const btn = sendBtnRef.current;
    if (btn && motionSafe) {
      gsap.fromTo(btn, { scale: 1 }, { scale: 1.03, duration: 0.15, ease: "power2.out", yoyo: true, repeat: 1 });
    }
    setText("");
    // 重置高度
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, onSend, motionSafe]);

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

  const pressSend = useCallback(() => {
    const el = sendBtnRef.current;
    if (!el || !motionSafe) return;
    gsap.to(el, { scale: 0.96, duration: 0.18, ease: "power2.out" });
  }, [motionSafe]);

  const releaseSend = useCallback(() => {
    const el = sendBtnRef.current;
    if (!el || !motionSafe) return;
    gsap.to(el, { scale: 1, duration: 0.22, ease: "back.out(1.4)" });
  }, [motionSafe]);

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
          ref={sendBtnRef}
          className="send-btn"
          onClick={handleSend}
          onPointerDown={pressSend}
          onPointerUp={releaseSend}
          onPointerLeave={releaseSend}
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
