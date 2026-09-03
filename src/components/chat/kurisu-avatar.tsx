"use client";

import { useEffect, useRef, useState } from "react";

interface KurisuAvatarProps {
  streaming?: boolean;
  phase?: "idle" | "waiting" | "speaking";
}

/** Kurisu Live2D 作为 AI 聊天头像：等待时思考，输出时说话 */
export function KurisuAvatar({ streaming = false, phase = "idle" }: KurisuAvatarProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevPhaseRef = useRef<"idle" | "waiting" | "speaking">("idle");

  useEffect(() => () => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
  }, []);

  useEffect(() => {
    if (!modelReady) return;
    const win = iframeRef.current?.contentWindow as (Window & {
      kurisuSetTalking?: (active: boolean) => void;
      kurisuPlayMotion?: (name: string) => void;
      clearExpression?: () => void;
    }) | null;
    if (!win) return;

    if (phase === "waiting") {
      // 等待回复：思考动作，不张嘴
      win.kurisuSetTalking?.(false);
      if (prevPhaseRef.current !== "waiting") {
        win.kurisuPlayMotion?.("thinking");
      }
    } else if (phase === "speaking") {
      // 输出回复：清除思考表情，张嘴说话
      if (prevPhaseRef.current === "waiting") {
        win.clearExpression?.();
      }
      win.kurisuSetTalking?.(true);
    } else {
      // 回复结束：闭嘴，清理动作
      if (prevPhaseRef.current === "speaking") {
        win.kurisuSetTalking?.(false);
        win.clearExpression?.();
        win.kurisuPlayMotion?.("mtn_01");
      }
    }

    prevPhaseRef.current = phase;
  }, [phase, modelReady, streaming]);

  return (
    <div className="kurisu-avatar" aria-hidden="true">
      <iframe
        ref={iframeRef}
        className="kurisu-avatar-frame"
        src="/live2d/index.html"
        title="Kurisu Live2D"
        tabIndex={-1}
        onLoad={() => {
          setLoaded(true);
          pollTimerRef.current = setInterval(() => {
            const win = iframeRef.current?.contentWindow as (Window & {
              __kurisuReady?: boolean;
            }) | null;
            if (win?.__kurisuReady === true) {
              if (pollTimerRef.current) clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
              setModelReady(true);
            }
          }, 200);
        }}
      />
    </div>
  );
}
