"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";
import gsap from "gsap";
import { useMotionSafe } from "./motion-safe";

/** 纯格式化:整数千分位 + 可选小数 */
export function formatNumber(value: number, decimals = 0, separator = true): string {
  const fixed = value.toFixed(decimals);
  if (!separator) return fixed;
  const [int, frac] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${grouped}.${frac}` : grouped;
}

interface CountUpProps {
  value: number;
  decimals?: number;
  /** 滚动时长(ms) */
  duration?: number;
  className?: string;
  style?: CSSProperties;
}

/** 数字滚动:首次进入视口后从 0 滚到目标值;动效关闭时直接落最终值;SSR 直出最终值 */
export function CountUp({ value, decimals = 0, duration = 600, className, style }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionSafe = useMotionSafe();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 先落 0 再滚,避免"最终值闪烁一帧"
    el.textContent = formatNumber(motionSafe ? 0 : value, decimals);
    if (!motionSafe) return;
    if (typeof IntersectionObserver === "undefined") {
      el.textContent = formatNumber(value, decimals);
      return;
    }
    const tween = gsap.fromTo(
      { v: 0 },
      { v: value },
      {
        duration: duration / 1000,
        ease: "power2.out",
        paused: true,
        onUpdate() {
          el.textContent = formatNumber(this.targets()[0].v, decimals);
        },
      },
    );
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        tween.play();
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      tween.kill();
    };
  }, [value, decimals, duration, motionSafe]);

  return (
    <span ref={ref} className={className} style={style}>
      {formatNumber(value, decimals)}
    </span>
  );
}
