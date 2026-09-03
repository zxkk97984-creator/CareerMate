"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useMotionSafe } from "@/lib/motion/motion-safe";

/**
 * 星野:丰富版动态背景(参考 Linear/Vercel/Stripe 式多光斑 morph + 星座粒子)
 *
 * 层级(由深到浅):
 * 1. 五光斑极光:天蓝/青/珊瑚三色阶大柔光斑,不同尺寸,22-36s 反向 morph
 *    (位移+缩放+旋转,yoyo 循环);外壳按深度分层视差响应鼠标——"丰富"的主体
 * 2. 粒子星座:canvas 80 点(移动端 36),开场即全屏散布,缓慢漂移、
 *    近距连线、亮星闪烁;粒子间 36px 内相互排斥防止缩团;
 *    光标 160px 清场:范围内粒子隐藏且被斥开,像拨开星野
 * 3. 流星:每 9-15 秒一颗珊瑚色流星带渐隐尾迹划过,呼应职业轨迹主题
 * 4. 透镜光晕 700px(双色:蓝芯+珊瑚缘):quickTo 0.6s 缓跟光标
 * 5. 光标辉点 64px:0.22s 紧贴
 * 6. 胶片颗粒:消除渐变色带
 *
 * 3. 光标光尾:移动时留下 1.2s 渐隐的柔光轨迹(full 变体)
 * 4. 粒子色相:蓝色粒子与珊瑚亮星随时间 ±10° 缓慢流转
 * 5. 登录页静谧变体(calm):粒子减半、无流星无光尾、光斑节奏放慢 1.6 倍
 *
 * 性能:视口外(IntersectionObserver)与标签页隐藏时暂停 rAF;dpr 上限 2。
 * 降级:reduced-motion 全静止(粒子不绘制);触屏设备不挂光标跟随。
 */
export function FluidBackground({ variant = "full" }: { variant?: "full" | "calm" }) {
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
    const COUNT = variant === "calm" ? (isMobile ? 18 : 40) : isMobile ? 36 : 80;
    const LINK_DIST = 130;
    const REPEL_DIST = 36;
    const CLEAR_DIST = 160;
    const TRAIL_LIFE = 1200;
    const TRAIL_MAX = 16;

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      tw: number;
      bright: boolean;
      hueBase: number;
    }
    // 开场即全屏散布,不做中心聚集
    const particles: Particle[] = Array.from({ length: COUNT }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.24,
      vy: (Math.random() - 0.5) * 0.24,
      r: 0.6 + Math.random() * 1.6,
      tw: Math.random() * Math.PI * 2,
      bright: Math.random() < 0.18,
      hueBase: Math.random() < 0.18 ? 40 : 250,
    }));

    // 光标光尾(full 变体):轨迹采样点,1.2s 渐隐
    const trail: Array<{ x: number; y: number; t: number }> = [];
    const sampleTrail = (x: number, y: number) => {
      trail.push({ x, y, t: performance.now() });
      if (trail.length > TRAIL_MAX) trail.shift();
    };

    // 流星状态:每 9-15 秒一颗(calm 变体无流星)
    let meteor: { x: number; y: number; vx: number; vy: number; life: number } | null = null;
    let nextMeteorAt =
      variant === "calm"
        ? Number.POSITIVE_INFINITY
        : performance.now() + 9000 + Math.random() * 6000;
    const spawnMeteor = () => {
      const fromLeft = Math.random() < 0.5;
      const speed = 8 + Math.random() * 5;
      const angle = Math.PI * (0.1 + Math.random() * 0.1);
      const dir = fromLeft ? 1 : -1;
      meteor = {
        x: fromLeft ? -60 : W + 60,
        y: Math.random() * H * 0.4,
        vx: dir * Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
      };
    };

    let mx = -1e4;
    let my = -1e4;
    let raf = 0;
    let visible = true;
    let paused = document.hidden;

    const frame = () => {
      c2d.clearRect(0, 0, W, H);

      // 光标光尾:按年龄渐隐
      if (variant === "full") {
        const now = performance.now();
        while (trail.length && now - trail[0].t > TRAIL_LIFE) trail.shift();
        for (const p of trail) {
          const age = (now - p.t) / TRAIL_LIFE;
          const a = (1 - age) * 0.2;
          c2d.fillStyle = `oklch(56% 0.154 250 / ${a})`;
          c2d.beginPath();
          c2d.arc(p.x, p.y, 2.5 * (1 - age * 0.5), 0, Math.PI * 2);
          c2d.fill();
        }
      }

      // 配对:粒子间斥力(防缩团)+ 连线
      for (let i = 0; i < COUNT; i++) {
        for (let j = i + 1; j < COUNT; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > 0.01 && d2 < REPEL_DIST * REPEL_DIST) {
            const d = Math.sqrt(d2);
            const f = (1 - d / REPEL_DIST) * 0.04;
            a.vx += (dx / d) * f;
            a.vy += (dy / d) * f;
            b.vx -= (dx / d) * f;
            b.vy -= (dy / d) * f;
          }
          // 连线:任一端点在光标清场范围内则不画
          const inClear =
            (a.x - mx) * (a.x - mx) + (a.y - my) * (a.y - my) < CLEAR_DIST * CLEAR_DIST ||
            (b.x - mx) * (b.x - mx) + (b.y - my) * (b.y - my) < CLEAR_DIST * CLEAR_DIST;
          if (!inClear && d2 < LINK_DIST * LINK_DIST) {
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

      // 流星:渐隐尾迹 + 头部亮点
      if (!meteor && performance.now() > nextMeteorAt) spawnMeteor();
      if (meteor) {
        meteor.life += 1;
        meteor.x += meteor.vx;
        meteor.y += meteor.vy;
        const fade = Math.max(0, 0.55 - meteor.life / 240);
        for (let k = 0; k < 12; k++) {
          const f = k / 12;
          const a = (1 - f) * fade;
          if (a <= 0.01) continue;
          c2d.fillStyle = `oklch(66% 0.165 40 / ${a})`;
          c2d.beginPath();
          c2d.arc(
            meteor.x - meteor.vx * f * 4,
            meteor.y - meteor.vy * f * 4,
            1.6 * (1 - f * 0.7),
            0,
            Math.PI * 2,
          );
          c2d.fill();
        }
        c2d.fillStyle = "oklch(80% 0.13 40 / 0.85)";
        c2d.beginPath();
        c2d.arc(meteor.x, meteor.y, 1.8, 0, Math.PI * 2);
        c2d.fill();
        if (
          meteor.life > 120 ||
          meteor.x < -100 ||
          meteor.x > W + 100 ||
          meteor.y > H + 100
        ) {
          meteor = null;
          nextMeteorAt = performance.now() + 9000 + Math.random() * 6000;
        }
      }

      // 粒子
      for (const p of particles) {
        // 鼠标清场:160px 内粒子被斥开,离开范围后恢复漂移
        const dx = p.x - mx;
        const dy = p.y - my;
        const d2 = dx * dx + dy * dy;
        const hidden = d2 < CLEAR_DIST * CLEAR_DIST;
        if (hidden && d2 > 1) {
          const d = Math.sqrt(d2);
          p.vx += (dx / d) * 0.08;
          p.vy += (dy / d) * 0.08;
        }
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -20) p.x = W + 20;
        else if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20;
        else if (p.y > H + 20) p.y = -20;
        // 清场范围内不绘制(隐藏)
        if (hidden) continue;
        p.tw += 0.02;
        const alpha = p.bright ? 0.45 + 0.35 * Math.sin(p.tw) : 0.3;
        // 色相流转:基础色相 ±10° 缓慢摆动
        const hue = p.hueBase + Math.sin(performance.now() * 0.00008 + p.tw * 2) * 10;
        c2d.fillStyle = p.bright
          ? `oklch(66% 0.165 ${hue} / ${alpha})`
          : `oklch(56% 0.154 ${hue} / ${alpha})`;
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

      // calm 变体放慢光斑节奏 1.6 倍
      const pace = variant === "calm" ? 1.6 : 1;
      const morph = (selector: string, vars: gsap.TweenVars, duration: number) => {
        gsap.to(selector, { ...vars, duration: duration * pace, ease: "sine.inOut", yoyo: true, repeat: -1 });
      };
      morph(".fblob-1", { x: 90, y: -60, scale: 1.12, rotation: 8 }, 22);
      morph(".fblob-2", { x: -70, y: 50, scale: 1.08, rotation: -6 }, 30);
      morph(".fblob-3", { x: -80, y: -40, scale: 1.1, rotation: 5 }, 36);
      morph(".fblob-4", { x: 50, y: 70, scale: 1.15, rotation: -8 }, 28);
      morph(".fblob-5", { x: 60, y: -70, scale: 1.12, rotation: 6 }, 34);

      // 开场 bloom:光斑渐显(只动 opacity,不与 morph 的 transform 冲突)
      gsap.fromTo(
        ".fblob",
        { opacity: 0 },
        { opacity: 1, duration: 1.6, ease: "power2.out", stagger: 0.12 },
      );

      // 深景视差:光斑外壳按深度分层响应鼠标(与光斑自身 morph 属性隔离)
      const shellMovers: Array<(dx: number, dy: number) => void> = [];
      const depths: Array<[string, number, number]> = [
        [".fblob-shell-1", 1.6, -34],
        [".fblob-shell-2", 2.0, -24],
        [".fblob-shell-3", 2.4, -40],
        [".fblob-shell-4", 1.8, -28],
        [".fblob-shell-5", 2.2, -36],
      ];
      for (const [sel, dur, k] of depths) {
        const el = root.querySelector<HTMLElement>(sel);
        if (!el) continue;
        const qx = gsap.quickTo(el, "x", { duration: dur, ease: "power2.out" });
        const qy = gsap.quickTo(el, "y", { duration: dur, ease: "power2.out" });
        shellMovers.push((dx, dy) => {
          qx(dx * k);
          qy(dy * k);
        });
      }

      const spotX = gsap.quickTo(spot, "x", { duration: 0.6, ease: "power3.out" });
      const spotY = gsap.quickTo(spot, "y", { duration: 0.6, ease: "power3.out" });
      const dotX = gsap.quickTo(dot, "x", { duration: 0.22, ease: "power2.out" });
      const dotY = gsap.quickTo(dot, "y", { duration: 0.22, ease: "power2.out" });

      const onMove = (e: PointerEvent) => {
        spotX(e.clientX);
        spotY(e.clientY);
        dotX(e.clientX);
        dotY(e.clientY);
        const dx = e.clientX / Math.max(1, window.innerWidth) - 0.5;
        const dy = e.clientY / Math.max(1, window.innerHeight) - 0.5;
        for (const move of shellMovers) move(dx, dy);
        if (variant === "full") sampleTrail(e.clientX, e.clientY);
        mx = e.clientX;
        my = e.clientY;
      };
      const onEnter = (e: PointerEvent) => {
        gsap.to([spot, dot], { opacity: 1, duration: 0.6, ease: "power2.out" });
        onMove(e);
      };
      const onLeave = () => {
        gsap.to([spot, dot], { opacity: 0, duration: 0.8, ease: "power2.out" });
        trail.length = 0;
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
  }, [motionSafe, variant]);

  return (
    <div ref={rootRef} className="fluid-bg" aria-hidden="true">
      <span className="fblob-shell fblob-shell-1">
        <span className="fblob fblob-1" />
      </span>
      <span className="fblob-shell fblob-shell-2">
        <span className="fblob fblob-2" />
      </span>
      <span className="fblob-shell fblob-shell-3">
        <span className="fblob fblob-3" />
      </span>
      <span className="fblob-shell fblob-shell-4">
        <span className="fblob fblob-4" />
      </span>
      <span className="fblob-shell fblob-shell-5">
        <span className="fblob fblob-5" />
      </span>
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
