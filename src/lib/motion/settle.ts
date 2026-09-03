"use client";

import gsap from "gsap";
import { getMotionSafe } from "./motion-safe";

/** 确认/提交后的沉降:轻微缩放回弹。动效关闭或无元素时直接完成回调 */
export function playSettle(el: HTMLElement | null, onComplete?: () => void): void {
  if (!el || !getMotionSafe()) {
    onComplete?.();
    return;
  }
  gsap.fromTo(el, { scale: 0.985 }, { scale: 1, duration: 0.25, ease: "power2.out", onComplete });
}

/** 记忆提案确认/忽略后的退场:淡出 + 轻微缩小,回调里再执行卸载,避免动画被截断 */
export function playExitFade(el: HTMLElement | null, onComplete?: () => void): void {
  if (!el || !getMotionSafe()) {
    onComplete?.();
    return;
  }
  gsap.to(el, { opacity: 0, scale: 0.98, duration: 0.25, ease: "power2.out", onComplete });
}
