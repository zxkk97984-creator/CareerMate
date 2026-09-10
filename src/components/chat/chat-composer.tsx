"use client";

import { useCallback, useRef, useState } from "react";
import gsap from "gsap";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { useMotionSafe } from "@/lib/motion/motion-safe";

interface ChatComposerProps {
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  onSend: (text: string) => void;
  disabled: boolean;
  activeConversationId: string | null;
  value?: string;
  onChange?: (text: string) => void;
}

export function ChatComposer({ onSend, disabled, value, onChange, placeholder, minLength = 1, maxLength = 8000 }: ChatComposerProps) {
  const [localText, setLocalText] = useState("");
  const text = value ?? localText;
  const setText = useCallback((next: string) => { setLocalText(next); onChange?.(next); }, [onChange]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendBtnRef = useRef<HTMLButtonElement>(null);
  const motionSafe = useMotionSafe();

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed.length < minLength || trimmed.length > maxLength || disabled) return;
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
  }, [text, onSend, motionSafe, disabled, setText, minLength, maxLength]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
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
          placeholder={placeholder ?? "输入你的问题，聊聊目标、学习或面试…"}
          rows={1}
          maxLength={maxLength}
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
          disabled={text.trim().length < minLength || disabled || text.trim().length > maxLength}
          aria-label={disabled ? "正在回复" : "发送消息"}
        >
          {disabled ? <LoaderCircle className="cm-spinner-icon" size={19} /> : <ArrowUp size={20} />}
        </button>
      </div>
      <p className="composer-hint">
        {text.length > 0 && `${text.length}/8000 `}
        AI 建议仅供参考，重要变更由你确认。
      </p>
    </div>
  );
}
