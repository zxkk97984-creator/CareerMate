"use client";

import { useEffect, useState } from "react";

/** 纯函数核心:根据 matchMedia 结果判断是否允许播放动效(便于 node 环境单测) */
export function queryMotionSafe(mq: { matches: boolean } | undefined): boolean {
  return mq ? !mq.matches : true;
}

let cached: boolean | null = null;

/** 同步读取:首次调用初始化缓存;SSR(无 window)默认 true(与客户端首帧一致,避免 hydration 不一致) */
export function getMotionSafe(): boolean {
  if (cached !== null) return cached;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    cached = true;
    return cached;
  }
  cached = queryMotionSafe(window.matchMedia("(prefers-reduced-motion: reduce)"));
  return cached;
}

/** 响应式 hook:订阅 prefers-reduced-motion 变化 */
export function useMotionSafe(): boolean {
  const [safe, setSafe] = useState<boolean>(() => getMotionSafe());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent) => {
      cached = !e.matches;
      setSafe(!e.matches);
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  return safe;
}
