"use client";

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import gsap from "gsap";
import { useMotionSafe } from "@/lib/motion/motion-safe";

export type RevealVariant = "rise" | "card" | "fade";

const VARIANTS: Record<RevealVariant, gsap.TweenVars> = {
  rise: { opacity: 0, y: 12, duration: 0.4, ease: "power2.out" },
  card: { opacity: 0, y: 16, scale: 0.985, duration: 0.4, ease: "power2.out" },
  fade: { opacity: 0, duration: 0.3, ease: "power2.out" },
};

interface RevealProps {
  children: ReactNode;
  variant?: RevealVariant;
  /** 单项延迟(秒) */
  delay?: number;
  /** 子元素间 stagger(秒);设置后动画目标为直接子元素 */
  stagger?: number;
  className?: string;
  style?: CSSProperties;
}

/** 声明式入场容器:动效关闭或 JS 失败时子元素始终可见(仅 from 动画) */
export function Reveal({ children, variant = "rise", delay = 0, stagger, className, style }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const motionSafe = useMotionSafe();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !motionSafe) return;
    const ctx = gsap.context(() => {
      const targets = stagger !== undefined ? Array.from(el.children) : el;
      gsap.from(targets, { ...VARIANTS[variant], delay, stagger: stagger ?? 0 });
    }, el);
    return () => ctx.revert();
  }, [motionSafe, variant, delay, stagger]);

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
