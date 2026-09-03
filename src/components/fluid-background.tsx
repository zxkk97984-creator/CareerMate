"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useMotionSafe } from "@/lib/motion/motion-safe";

/**
 * 光幕 Lens:双深度光标跟随 + 极慢光斑漂移 + 胶片颗粒(替换原网格视差背景)
 *
 * 层级(由深到浅):
 * 1. 两个超大柔光斑:48s/64s 反向极慢漂移 + 呼吸;光标经过时轻微避让(外层 shell)
 * 2. 透镜光晕 700px:gsap.quickTo 0.6s 平滑缓跟光标,像光标带着一块柔光玻璃
 * 3. 光标辉点 64px:0.22s 紧贴跟随——两层速度差即"高级感"来源
 * 4. 胶片颗粒:SVG feTurbulence 静态纹理,消除渐变色带
 *
 * 降级:reduced-motion 全静止;触屏设备(无精确指针)不挂跟随,只留光斑呼吸。
 */
export function FluidBackground() {
  const rootRef = useRef<HTMLDivElement>(null);
  const motionSafe = useMotionSafe();

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !motionSafe) return;

    const spot = root.querySelector<HTMLElement>(".fspot");
    const dot = root.querySelector<HTMLElement>(".fdot");
    const b1 = root.querySelector<HTMLElement>(".fblob-1");
    const b2 = root.querySelector<HTMLElement>(".fblob-2");
    const s1 = root.querySelector<HTMLElement>(".fblob-shell-1");
    const s2 = root.querySelector<HTMLElement>(".fblob-shell-2");
    if (!spot || !dot || !b1 || !b2 || !s1 || !s2) return;

    const ctx = gsap.context(() => {
      // 光标元素以自身中心对准光标(gsap 合成 xPercent 与 x/y,不用 CSS translate)
      gsap.set([spot, dot], { xPercent: -50, yPercent: -50 });

      // 光斑极慢漂移 + 呼吸(在光斑自身,与 shell 的避让互不冲突)
      gsap.to(b1, {
        x: 70,
        y: -50,
        scale: 1.07,
        duration: 26,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });
      gsap.to(b2, {
        x: -60,
        y: 60,
        scale: 1.09,
        duration: 34,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });

      // 双深度跟随:透镜缓跟,辉点紧贴
      const spotX = gsap.quickTo(spot, "x", { duration: 0.6, ease: "power3.out" });
      const spotY = gsap.quickTo(spot, "y", { duration: 0.6, ease: "power3.out" });
      const dotX = gsap.quickTo(dot, "x", { duration: 0.22, ease: "power2.out" });
      const dotY = gsap.quickTo(dot, "y", { duration: 0.22, ease: "power2.out" });

      // 光斑避让:比透镜更慢,制造第三层深度
      const b1x = gsap.quickTo(s1, "x", { duration: 1.4, ease: "power2.out" });
      const b1y = gsap.quickTo(s1, "y", { duration: 1.4, ease: "power2.out" });
      const b2x = gsap.quickTo(s2, "x", { duration: 1.6, ease: "power2.out" });
      const b2y = gsap.quickTo(s2, "y", { duration: 1.6, ease: "power2.out" });

      const onMove = (e: PointerEvent) => {
        spotX(e.clientX);
        spotY(e.clientY);
        dotX(e.clientX);
        dotY(e.clientY);
        const dx = e.clientX / Math.max(1, window.innerWidth) - 0.5;
        const dy = e.clientY / Math.max(1, window.innerHeight) - 0.5;
        b1x(dx * -26);
        b1y(dy * -26);
        b2x(dx * 22);
        b2y(dy * 22);
      };

      const onEnter = (e: PointerEvent) => {
        gsap.to([spot, dot], { opacity: 1, duration: 0.6, ease: "power2.out" });
        onMove(e);
      };
      const onLeave = () => {
        gsap.to([spot, dot], { opacity: 0, duration: 0.8, ease: "power2.out" });
      };

      // 仅精确指针设备挂跟随(触屏无光标)
      const fine = window.matchMedia("(pointer: fine)");
      if (fine.matches) {
        window.addEventListener("pointermove", onMove);
        document.documentElement.addEventListener("pointerenter", onEnter);
        document.documentElement.addEventListener("pointerleave", onLeave);
      }
      return () => {
        window.removeEventListener("pointermove", onMove);
        document.documentElement.removeEventListener("pointerenter", onEnter);
        document.documentElement.removeEventListener("pointerleave", onLeave);
      };
    }, root);

    return () => ctx.revert();
  }, [motionSafe]);

  return (
    <div ref={rootRef} className="fluid-bg" aria-hidden="true">
      <span className="fblob-shell fblob-shell-1">
        <span className="fblob fblob-1" />
      </span>
      <span className="fblob-shell fblob-shell-2">
        <span className="fblob fblob-2" />
      </span>
      <span className="fspot" />
      <span className="fdot" />
      <svg className="fgrain" aria-hidden="true">
        <filter id="fgrain-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#fgrain-noise)" />
      </svg>
    </div>
  );
}
