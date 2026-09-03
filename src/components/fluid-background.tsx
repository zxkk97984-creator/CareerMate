"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useMotionSafe } from "@/lib/motion/motion-safe";

/**
 * 星野:丰富版动态背景(参考 Linear/Vercel/Stripe 式多光斑 morph + 星座粒子)
 *
 * 层级(由深到浅):
 * 1. 五光斑极光:天蓝/青/珊瑚三色阶大柔光斑,不同尺寸,22-36s 反向 morph
 *    (位移+缩放+旋转,yoyo 循环)——"丰富"的主体
 * 2. 粒子星座:canvas 80 点(移动端 36),缓慢漂移、近距连线、亮星闪烁;
 *    鼠标 160px 内轻微斥力,像拨动星野
 * 3. 透镜光晕 700px:quickTo 0.6s 缓跟光标
 * 4. 光标辉点 64px:0.22s 紧贴
 * 5. 胶片颗粒:消除渐变色带
 *
 * 性能:视口外(IntersectionObserver)与标签页隐藏时暂停 rAF;dpr 上限 2。
 * 降级:reduced-motion 全静止(粒子不绘制);触屏设备不挂光标跟随。
 */
export function FluidBackground() {
  const rootRef = useRef<HTMLDivElement>(null);
  const motionSafe = useMotionSafe();

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !motionSafe) return;

    const spot = root.querySelector<HTMLElement>(".fspot");
    const dot = root.querySelector<HTMLElement>(".fdot");
    const canvas = root.querySelector<HTMLCanvasElement>(".fconstellation");
    if (!spot || !dot || !canvas) return;
    const c2d = canvas.getContext("2d");
    if (!c2d) return;

    // ── 粒子星座 ──────────────────────────────────────────
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const COUNT = isMobile ? 36 : 80;
    const LINK_DIST = 130;
    const MOUSE_RADIUS = 160;

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      tw: number;
      bright: boolean;
    }
    const particles: Particle[] = Array.from({ length: COUNT }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.24,
      vy: (Math.random() - 0.5) * 0.24,
      r: 0.6 + Math.random() * 1.6,
      tw: Math.random() * Math.PI * 2,
      bright: Math.random() < 0.18,
    }));

    let mx = -1e4;
    let my = -1e4;
    let raf = 0;
    let visible = true;
    let paused = document.hidden;

    const frame = () => {
      c2d.clearRect(0, 0, W, H);

      // 连线
      for (let i = 0; i < COUNT; i++) {
        for (let j = i + 1; j < COUNT; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < LINK_DIST * LINK_DIST) {
            const d = Math.sqrt(d2);
            c2d.strokeStyle = `oklch(56% 0.154 250 / ${(1 - d / LINK_DIST) * 0.2})`;
            c2d.lineWidth = 0.6;
            c2d.beginPath();
            c2d.moveTo(a.x, a.y);
            c2d.lineTo(b.x, b.y);
            c2d.stroke();
          }
        }
      }

      // 粒子
      for (const p of particles) {
        const dx = p.x - mx;
        const dy = p.y - my;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1 && d2 < MOUSE_RADIUS * MOUSE_RADIUS) {
          const d = Math.sqrt(d2);
          p.vx += (dx / d) * 0.06;
          p.vy += (dy / d) * 0.06;
        }
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -20) p.x = W + 20;
        else if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20;
        else if (p.y > H + 20) p.y = -20;
        p.tw += 0.02;
        const alpha = p.bright ? 0.45 + 0.35 * Math.sin(p.tw) : 0.3;
        c2d.fillStyle = p.bright
          ? `oklch(66% 0.165 40 / ${alpha})`
          : `oklch(56% 0.154 250 / ${alpha})`;
        c2d.beginPath();
        c2d.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        c2d.fill();
      }

      raf = requestAnimationFrame(loop);
    };

    const loop = () => {
      if (visible && !paused) frame();
      else raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // 视口外暂停
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting);
      },
      { threshold: 0 },
    );
    io.observe(canvas);
    const onVisibility = () => {
      paused = document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);

    // ── GSAP 层(光斑 morph + 光标跟随)─────────────────────
    const ctx = gsap.context(() => {
      gsap.set([spot, dot], { xPercent: -50, yPercent: -50 });

      const morph = (selector: string, vars: gsap.TweenVars, duration: number) => {
        gsap.to(selector, { ...vars, duration, ease: "sine.inOut", yoyo: true, repeat: -1 });
      };
      morph(".fblob-1", { x: 90, y: -60, scale: 1.12, rotation: 8 }, 22);
      morph(".fblob-2", { x: -70, y: 50, scale: 1.08, rotation: -6 }, 30);
      morph(".fblob-3", { x: -80, y: -40, scale: 1.1, rotation: 5 }, 36);
      morph(".fblob-4", { x: 50, y: 70, scale: 1.15, rotation: -8 }, 28);
      morph(".fblob-5", { x: 60, y: -70, scale: 1.12, rotation: 6 }, 34);

      const spotX = gsap.quickTo(spot, "x", { duration: 0.6, ease: "power3.out" });
      const spotY = gsap.quickTo(spot, "y", { duration: 0.6, ease: "power3.out" });
      const dotX = gsap.quickTo(dot, "x", { duration: 0.22, ease: "power2.out" });
      const dotY = gsap.quickTo(dot, "y", { duration: 0.22, ease: "power2.out" });

      const onMove = (e: PointerEvent) => {
        spotX(e.clientX);
        spotY(e.clientY);
        dotX(e.clientX);
        dotY(e.clientY);
        mx = e.clientX;
        my = e.clientY;
      };
      const onEnter = (e: PointerEvent) => {
        gsap.to([spot, dot], { opacity: 1, duration: 0.6, ease: "power2.out" });
        onMove(e);
      };
      const onLeave = () => {
        gsap.to([spot, dot], { opacity: 0, duration: 0.8, ease: "power2.out" });
        mx = -1e4;
        my = -1e4;
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

    return () => {
      ctx.revert();
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
    };
  }, [motionSafe]);

  return (
    <div ref={rootRef} className="fluid-bg" aria-hidden="true">
      <span className="fblob fblob-1" />
      <span className="fblob fblob-2" />
      <span className="fblob fblob-3" />
      <span className="fblob fblob-4" />
      <span className="fblob fblob-5" />
      <canvas className="fconstellation" />
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
