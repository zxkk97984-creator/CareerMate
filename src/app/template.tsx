"use client";

import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { useMotionSafe } from "@/lib/motion/motion-safe";

/** 页面级入场:路由切换时整页仅 opacity 淡入 300ms;退出动画不做(App Router 无统一卸载时机) */
export default function Template({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const motionSafe = useMotionSafe();

  useEffect(() => {
    const el = ref.current;
    if (!el || !motionSafe) return;
    // fromTo 显式指定终点 1:避免 StrictMode 双跑 effect 时 gsap.from
    // 把上一次被 kill 的残留 opacity 当作终点,导致页面停在半透明/透明
    const tween = gsap.fromTo(
      el,
      { opacity: 0 },
      { opacity: 1, duration: 0.3, ease: "power2.out" },
    );
    return () => {
      tween.kill();
    };
  }, [motionSafe]);

  return <div ref={ref}>{children}</div>;
}
