"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

/** 随鼠标指针平滑移动的动态背景层：柔光 + 网格视差（GSAP 驱动） */
export function InteractiveBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const state = { x: 0, y: 0 };
    let tween: gsap.core.Tween | null = null;

    const onMove = (e: MouseEvent) => {
      const targetX = e.clientX / Math.max(1, window.innerWidth) - 0.5;
      const targetY = e.clientY / Math.max(1, window.innerHeight) - 0.5;
      tween?.kill();
      tween = gsap.to(state, {
        x: targetX,
        y: targetY,
        duration: 0.8,
        ease: "power3.out",
        overwrite: "auto",
        onUpdate: () => {
          el.style.setProperty("--mx", String(state.x));
          el.style.setProperty("--my", String(state.y));
        },
      });
    };

    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      tween?.kill();
    };
  }, []);

  return (
    <div ref={ref} className="interactive-bg" aria-hidden="true">
      <span className="ibg-blob ibg-blob-1" />
      <span className="ibg-blob ibg-blob-2" />
      <span className="ibg-blob ibg-blob-3" />
      <span className="ibg-grid" />
    </div>
  );
}
