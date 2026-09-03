"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useMotionSafe } from "@/lib/motion/motion-safe";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const motionSafe = useMotionSafe();

  useEffect(() => () => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
  }, []);

  // 呼吸浮动:仅 idle/waiting 时轻浮;speaking 时容器不动(Live2D 自带说话动作)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !motionSafe || phase === "speaking") return;
    const float = gsap.to(el, { y: -6, duration: 2.6, ease: "sine.inOut", yoyo: true, repeat: -1 });
    return () => {
      float.kill();
      gsap.set(el, { y: 0 });
    };
  }, [phase, motionSafe]);

  // waiting(思考)时的轻微倾斜
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !motionSafe || phase !== "waiting") return;
    const tilt = gsap.to(el, { rotation: 1.5, duration: 0.8, ease: "sine.inOut", yoyo: true, repeat: 3 });
    return () => {
      tilt.kill();
      gsap.set(el, { rotation: 0 });
    };
  }, [phase, motionSafe]);

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
    <div ref={containerRef} className="kurisu-avatar" aria-hidden="true">
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
