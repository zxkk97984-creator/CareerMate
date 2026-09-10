"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";

/** Text and elapsed time remain useful even when reduced motion disables animation. */
export function ChatProgress({ startedAt, content }: { startedAt: string; content: string }) {
  const [now, setNow] = useState(() => Date.now());
  const lastTextAt = useRef(0);
  const [waiting, setWaiting] = useState(!content);
  useEffect(() => { lastTextAt.current = Date.now(); }, [content]);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      setWaiting(!content || Date.now() - lastTextAt.current >= 5_000);
    }, 1_000);
    return () => clearInterval(timer);
  }, [content]);
  const seconds = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1_000)) || 0;
  return <div className="chat-progress" role="status" aria-live="polite">
    <div className="chat-progress-heading">
      <LoaderCircle className="cm-spinner-icon" size={16} aria-hidden="true" />
      <span>{waiting ? "仍在处理，等待下一段回复" : "正在生成回复"}</span>
      <span className="chat-progress-time" aria-live="off">已等待 {seconds} 秒</span>
    </div>
    <p>复杂任务可能需要几分钟；刷新或切换页面后，回答会自动恢复。</p>
  </div>;
}
