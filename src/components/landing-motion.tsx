"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { useMotionSafe } from "@/lib/motion/motion-safe";

const STEPS: Array<{ selector: string; from: gsap.TweenVars; at: number }> = [
  { selector: ".landing-new-badge", from: { opacity: 0, y: 10, duration: 0.5, ease: "power2.out" }, at: 0 },
  { selector: ".landing-new-title", from: { opacity: 0, y: 16, duration: 0.6, ease: "expo.out" }, at: 0.08 },
  { selector: ".landing-new-subtitle", from: { opacity: 0, y: 12, duration: 0.5, ease: "power2.out" }, at: 0.22 },
  { selector: ".landing-new-actions", from: { opacity: 0, y: 12, duration: 0.5, ease: "power2.out" }, at: 0.32 },
  { selector: ".landing-new-stats .landing-new-stat", from: { opacity: 0, y: 12, duration: 0.45, ease: "power2.out", stagger: 0.06 }, at: 0.42 },
  { selector: ".landing-art-card", from: { opacity: 0, x: 24, duration: 0.5, ease: "expo.out", stagger: 0.08 }, at: 0.3 },
];

/** 欢迎页 hero 编排:全站唯一编排型入场,一次性播放;总长约 800ms */
export function LandingMotion({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const motionSafe = useMotionSafe();

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !motionSafe) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      for (const step of STEPS) {
        tl.from(step.selector, { ...step.from }, step.at);
      }
    }, root);
    return () => ctx.revert();
  }, [motionSafe]);

  return <div ref={ref}>{children}</div>;
}
