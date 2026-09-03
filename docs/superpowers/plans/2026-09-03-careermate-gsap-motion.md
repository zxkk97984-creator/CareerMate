# CareerMate GSAP 动效实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 repo2 的 v13 视觉之上建立统一、克制、可测试的 GSAP 运动层,并铺到欢迎页、聊天、候选卡、仪表盘、抽屉与发送按钮。

**Architecture:** 薄的 `src/lib/motion/` 工具层(动效门控 + 数字滚动 + 沉降工具)+ 声明式 `<Reveal>` 客户端组件 + 页面级 `template.tsx` 入场,再逐场景接入。全部动效只动 transform/opacity、用 `from` 语义(降级安全)、过 `useMotionSafe()` 门控。

**Tech Stack:** Next.js 16.2.10(App Router)、React 19.2.4、GSAP 3.15.0(已在 dependencies)、recharts 3.1.2、Vitest 3.2.6(node 环境)、Playwright 1.61.1。

## Global Constraints

- **依赖冻结**:不得新增/升级任何 npm 依赖;不得引入 GSAP 插件(ScrollTrigger / SplitText / TextPlugin)。
- **git**:repo2 已初始化 git(基线提交 `ee3c6df`,工作分支 `motion/gsap-v1`)。每个任务结束时,实现者提交该任务的改动(单条提交,信息形如 `feat(motion): 动效门控工具层`);任务完成标志 = 测试通过 + 已提交。**禁止**修改与任务无关的文件;禁止 `git push`(无远程)。
- **已知基线问题(执行期实测,勿修勿扰)**:仓库基线存在 4054 个 lint 问题(183 errors,主要来自 tracked 的 `public/lib/*.min.js` 压缩产物,`npm run lint` 因 `--max-warnings=0` 必然非零退出)与 1 个既有测试失败(`src/features/simulation` 中"训练得分:82 分"断言)。执行时以"**不新增** lint 错误/测试失败"为准,不要顺手修复这些既有问题(超出本计划范围)。
- **所有命令在 `repo2` 目录下运行**(本文件中的相对路径均以 repo2 为根)。
- **视觉冻结**:不动任何 v13 令牌(颜色/圆角/字号/阴影);新增样式仅限 transform/opacity/will-change;只动 transform + opacity,绝不动画布局属性。
- **降级安全**:所有 GSAP 动画一律 `from`/`fromTo` 语义;JS 失败或 reduced-motion 时元素处于最终可见态,绝不卡在 `opacity: 0`。
- **门控**:每个 JS 动效必须过 `useMotionSafe()`(hook)或 `getMotionSafe()`(同步),不遗漏。
- **CSS 现状保留**:`cm-rise`/`cm-typing`/`cm-spin`/`cm-grow-x` 等现有 keyframes 与 `.cm-reveal` 工具类一律保留、不迁移、不复用其类名;`prefers-reduced-motion` 全局 CSS 块不动。
- **测试环境**:Vitest `environment: "node"`,无 jsdom、无 setupFiles;组件测试用 `renderToStaticMarkup`(effect 不会执行,SSR 输出即断言对象)。组件测试文件与组件同目录命名 `*.test.tsx`。
- **Playwright**:不修改 `playwright.config.ts` 全局配置(现有测试行为不可变);新增 e2e 用例内自行 `test.use({ reducedMotion: "reduce" })`。
- **节奏表**:微交互 150–250ms `power2.out`(按压回弹 `back.out(1.4)`);入场 300–450ms `power2.out`;编排 600–900ms `expo.out`、单项 stagger 50–70ms;出场 ≤250ms。stagger 上限 8 项。
- **ESLint `max-warnings=0`**:新增代码不得产生任何 lint 警告;需要时用仓库既有惯例 `// eslint-disable-next-line react-hooks/exhaustive-deps`。

---

### Task 1: 动效门控 `useMotionSafe` / `getMotionSafe` + 视差背景接入

**Files:**
- Create: `src/lib/motion/motion-safe.ts`
- Modify: `src/components/interactive-background.tsx`(接入门控,spec §4 改造点)
- Test: `src/lib/motion/motion-safe.test.ts`
- Test: `src/components/interactive-background.test.tsx`

**Interfaces:**
- Produces: `queryMotionSafe(mq: { matches: boolean } | undefined): boolean`(纯函数,node 可测);`getMotionSafe(): boolean`(同步、带缓存,SSR 默认 true);`useMotionSafe(): boolean`(订阅 `prefers-reduced-motion` 变化的 hook)。后续所有任务消费这三个接口。

- [ ] **Step 1: 写失败测试**

创建 `src/lib/motion/motion-safe.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { queryMotionSafe } from "./motion-safe";

describe("queryMotionSafe", () => {
  it("allows motion when user has no reduce preference", () => {
    expect(queryMotionSafe({ matches: false })).toBe(true);
  });

  it("blocks motion when reduce is requested", () => {
    expect(queryMotionSafe({ matches: true })).toBe(false);
  });

  it("allows motion when media query is unavailable", () => {
    expect(queryMotionSafe(undefined)).toBe(true);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/lib/motion/motion-safe.test.ts`
Expected: FAIL(找不到 `./motion-safe` 模块)

- [ ] **Step 3: 实现**

创建 `src/lib/motion/motion-safe.ts`:

```ts
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
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- src/lib/motion/motion-safe.test.ts`
Expected: 3 passed

- [ ] **Step 5: 验证**

Run: `npm run lint` → 0 warnings;`npm run typecheck` → 无错误。

- [ ] **Step 6: 视差背景接入门控(失败测试)**

创建 `src/components/interactive-background.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InteractiveBackground } from "./interactive-background";

describe("InteractiveBackground (SSR)", () => {
  it("renders the background layers visible", () => {
    const html = renderToStaticMarkup(<InteractiveBackground />);
    expect(html).toContain("interactive-bg");
    expect(html).toContain("ibg-blob-1");
    expect(html).toContain("ibg-grid");
    expect(html).not.toContain("opacity:0");
  });
});
```

Run: `npm test -- src/components/interactive-background.test.tsx`
Expected: FAIL(找不到测试文件)

- [ ] **Step 7: 修改 `interactive-background.tsx`**

把 `src/components/interactive-background.tsx` 的 import 区改为:

```tsx
"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useMotionSafe } from "@/lib/motion/motion-safe";
```

组件函数体内,`ref` 声明后加一行 `const motionSafe = useMotionSafe();`,并把现有 `useEffect` 改为:

```tsx
  useEffect(() => {
    const el = ref.current;
    // 动效关闭时保持静态,不挂 mousemove、不建 tween
    if (!el || !motionSafe) return;

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
  }, [motionSafe]);
```

(其余 JSX 原样保留。)

- [ ] **Step 8: 运行确认通过**

Run: `npm test -- src/components/interactive-background.test.tsx`
Expected: 1 passed

- [ ] **Step 9: 验证**

Run: `npm run lint`、`npm run typecheck` 通过。

---

### Task 2: 数字滚动 `CountUp` + `formatNumber`

**Files:**
- Create: `src/lib/motion/count-up.tsx`
- Test: `src/lib/motion/count-up.test.tsx`

**Interfaces:**
- Consumes: `useMotionSafe()`(Task 1)
- Produces: `formatNumber(value: number, decimals?: number, separator?: boolean): string`;`<CountUp value={number} decimals?={number} duration?={number} className? style?>`(span 渲染;SSR 直出最终值)

- [ ] **Step 1: 写失败测试**

创建 `src/lib/motion/count-up.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CountUp, formatNumber } from "./count-up";

describe("formatNumber", () => {
  it("groups thousands", () => {
    expect(formatNumber(12345)).toBe("12,345");
  });

  it("keeps decimals", () => {
    expect(formatNumber(12345.6, 1)).toBe("12,345.6");
  });

  it("skips separator when asked", () => {
    expect(formatNumber(12345.6, 1, false)).toBe("12345.6");
  });
});

describe("CountUp (SSR)", () => {
  it("renders the final value server-side", () => {
    const html = renderToStaticMarkup(<CountUp value={82} />);
    expect(html).toContain("82");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/lib/motion/count-up.test.tsx`
Expected: FAIL(找不到 `./count-up` 模块)

- [ ] **Step 3: 实现**

创建 `src/lib/motion/count-up.tsx`:

```tsx
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
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- src/lib/motion/count-up.test.tsx`
Expected: 4 passed

- [ ] **Step 5: 验证**

Run: `npm run lint`、`npm run typecheck` 通过。

---

### Task 3: 声明式入场 `<Reveal>`

**Files:**
- Create: `src/components/ui/reveal.tsx`
- Test: `src/components/ui/reveal.test.tsx`

**Interfaces:**
- Consumes: `useMotionSafe()`(Task 1)
- Produces: `<Reveal variant?="rise" | "card" | "fade" delay?={number} stagger?={number} className? style?>{children}</Reveal>`。设 `stagger` 时动画目标是直接子元素(上限 8,由使用方控制数量),否则是容器本身。Task 6/10/11 消费。

- [ ] **Step 1: 写失败测试**

创建 `src/components/ui/reveal.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Reveal } from "./reveal";

describe("Reveal (SSR)", () => {
  it("renders children visible by default", () => {
    const html = renderToStaticMarkup(
      <Reveal variant="card">
        <p>卡片</p>
      </Reveal>,
    );
    expect(html).toContain("卡片");
    expect(html).not.toContain("opacity:0");
    expect(html).not.toContain("opacity: 0");
  });

  it("supports custom class", () => {
    const html = renderToStaticMarkup(
      <Reveal className="x">
        <p>a</p>
      </Reveal>,
    );
    expect(html).toContain('class="x"');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/components/ui/reveal.test.tsx`
Expected: FAIL(找不到 `./reveal` 模块)

- [ ] **Step 3: 实现**

创建 `src/components/ui/reveal.tsx`:

```tsx
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
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- src/components/ui/reveal.test.tsx`
Expected: 2 passed

- [ ] **Step 5: 验证**

Run: `npm run lint`、`npm run typecheck` 通过。

---

### Task 4: 沉降/退场工具 `playSettle` / `playExitFade`

**Files:**
- Create: `src/lib/motion/settle.ts`
- Test: `src/lib/motion/settle.test.ts`

**Interfaces:**
- Consumes: `getMotionSafe()`(Task 1)
- Produces: `playSettle(el: HTMLElement | null, onComplete?: () => void): void`(确认后的沉降回弹);`playExitFade(el: HTMLElement | null, onComplete?: () => void): void`(卸载前淡出,回调中执行卸载)。两者在无元素/门控关闭时立即调用 `onComplete`。Task 10 消费。

- [ ] **Step 1: 写失败测试**

创建 `src/lib/motion/settle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { playExitFade, playSettle } from "./settle";

describe("settle helpers", () => {
  it("completes immediately when no element (safe no-op)", () => {
    let done = false;
    playSettle(null, () => {
      done = true;
    });
    expect(done).toBe(true);
  });

  it("playExitFade completes immediately when no element", () => {
    let done = false;
    playExitFade(null, () => {
      done = true;
    });
    expect(done).toBe(true);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/lib/motion/settle.test.ts`
Expected: FAIL(找不到 `./settle` 模块)

- [ ] **Step 3: 实现**

创建 `src/lib/motion/settle.ts`:

```ts
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
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- src/lib/motion/settle.test.ts`
Expected: 2 passed

- [ ] **Step 5: 验证**

Run: `npm run lint`、`npm run typecheck` 通过。

---

### Task 5: 页面级入场 `src/app/template.tsx`

**Files:**
- Create: `src/app/template.tsx`
- Test: `src/app/template.test.tsx`

**Interfaces:**
- Consumes: `useMotionSafe()`(Task 1)
- Produces: 默认导出 `Template({ children })`,App Router 在每次路由切换时重新挂载,整页仅 opacity 淡入 300ms;不做退出动画。

- [ ] **Step 1: 写失败测试**

创建 `src/app/template.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Template from "./template";

describe("Template (SSR)", () => {
  it("renders children without inline opacity styles", () => {
    const html = renderToStaticMarkup(
      <Template>
        <main>内容</main>
      </Template>,
    );
    expect(html).toContain("内容");
    expect(html).not.toContain("opacity:0");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/app/template.test.tsx`
Expected: FAIL(找不到 `./template` 模块)

- [ ] **Step 3: 实现**

创建 `src/app/template.tsx`:

```tsx
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
    const tween = gsap.from(el, { opacity: 0, duration: 0.3, ease: "power2.out" });
    return () => {
      tween.kill();
    };
  }, [motionSafe]);

  return <div ref={ref}>{children}</div>;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- src/app/template.test.tsx`
Expected: 1 passed

- [ ] **Step 5: 验证(重点:布局不被 wrapper div 破坏)**

Run: `npm run lint`、`npm run typecheck`、`npm test`(全量,防止模板 wrapper 破坏既有测试)。
然后手动检查:运行 `start-dev.bat` 或 `npm run dev`,依次打开 `/`、`/login`、`/dashboard`,确认布局无塌陷(侧栏 + 主区仍为整屏 flex、落地页 hero 居中)。若发现布局破坏,回退方案:删除 template.tsx,改为在各页面根组件用 `<Reveal variant="fade">` 包裹,并在设计文档中记录此偏差。

---

### Task 6: 欢迎页 hero 编排

**Files:**
- Create: `src/components/landing-motion.tsx`
- Modify: `src/components/landing-page.tsx`(仅 hero section 包一层)
- Test: `src/components/landing-motion.test.tsx`

**Interfaces:**
- Consumes: `useMotionSafe()`(Task 1)
- Produces: `<LandingMotion>{children}</LandingMotion>`,对子元素内 `.landing-new-badge/.landing-new-title/.landing-new-subtitle/.landing-new-actions/.landing-new-stats .landing-new-stat/.landing-art-card` 播放一次性编排。

- [ ] **Step 1: 写失败测试**

创建 `src/components/landing-motion.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LandingMotion } from "./landing-motion";

describe("LandingMotion (SSR)", () => {
  it("renders children visible", () => {
    const html = renderToStaticMarkup(
      <LandingMotion>
        <section className="landing-new-hero">
          <h1 className="landing-new-title">标题</h1>
        </section>
      </LandingMotion>,
    );
    expect(html).toContain("标题");
    expect(html).toContain("landing-new-hero");
    expect(html).not.toContain("opacity:0");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/components/landing-motion.test.tsx`
Expected: FAIL(找不到 `./landing-motion` 模块)

- [ ] **Step 3: 实现 `landing-motion.tsx`**

创建 `src/components/landing-motion.tsx`:

```tsx
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
```

- [ ] **Step 4: 修改 `landing-page.tsx`**

打开 `src/components/landing-page.tsx`,做两处修改:

1. 在 import 区(`import Link from "next/link";` 之后)加一行:

```tsx
import { LandingMotion } from "@/components/landing-motion";
```

2. 把 `<section className="landing-new-hero">...</section>`(含 hero-copy 与 landing-new-art 整段,约 40-80 行)**整体**包进 `LandingMotion`:

```tsx
      <LandingMotion>
        <section className="landing-new-hero">
          {/* ……原内容不变…… */}
        </section>
      </LandingMotion>
```

其余(features/steps/CTA/footer)不动——它们在首屏折叠线以下,按克制原则本期不做滚动触发。

- [ ] **Step 5: 运行确认通过**

Run: `npm test -- src/components/landing-motion.test.tsx`
Expected: 1 passed

- [ ] **Step 6: 验证**

Run: `npm run lint`、`npm run typecheck`、`npm test`(全量)。
手动:打开 `/` 确认 hero 编排播放一次、无残留透明;`prefers-reduced-motion` 模拟下(DevTools Rendering 面板)元素直接可见。

---

### Task 7: 聊天消息入场(仅新消息追加)

**Files:**
- Modify: `src/components/chat/chat-thread.tsx`
- Test: `src/components/chat/chat-thread-entrance.test.tsx`

**Interfaces:**
- Consumes: `useMotionSafe()`(Task 1)
- Produces: 消息 wrapper 新增 `data-msg-id={msg.id}`;入场规则:仅当 `messages.length` 较上次提交 **+1 或 +2**、最新一条 id 未见过、且 `status !== "streaming"` 时,对最新一条播放 rise+fade 350ms。首帧、历史加载、流式更新均不触发。

- [ ] **Step 1: 写失败测试**

创建 `src/components/chat/chat-thread-entrance.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatThread } from "./chat-thread";

function renderThread() {
  return renderToStaticMarkup(
    <ChatThread
      messages={[
        {
          id: "m1",
          conversationId: "c1",
          role: "user",
          content: "你好",
          parts: [],
          status: "completed",
          executionMeta: {},
          contextMeta: {},
          createdAt: "2026-09-03T00:00:00.000Z",
        },
        {
          id: "m2",
          conversationId: "c1",
          role: "assistant",
          content: "你好!",
          parts: [],
          status: "completed",
          executionMeta: {},
          contextMeta: {},
          createdAt: "2026-09-03T00:00:01.000Z",
        },
      ]}
      activeConversationId="c1"
      onNewChat={vi.fn()}
    />,
  );
}

describe("ChatThread 入场标记", () => {
  it("renders data-msg-id on every message wrapper", () => {
    const html = renderThread();
    expect(html).toContain('data-msg-id="m1"');
    expect(html).toContain('data-msg-id="m2"');
  });

  it("renders messages visible without inline opacity", () => {
    const html = renderThread();
    expect(html).toContain("你好");
    expect(html).not.toContain("opacity:0");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/components/chat/chat-thread-entrance.test.tsx`
Expected: FAIL(`data-msg-id` 断言失败)

- [ ] **Step 3: 修改 `chat-thread.tsx`**

1. import 区加两行:

```tsx
import gsap from "gsap";
import { useMotionSafe } from "@/lib/motion/motion-safe";
```

2. 组件函数体内,`bottomRef` 声明之后加:

```tsx
  const threadRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const prevLenRef = useRef(0);
  const firstRenderRef = useRef(true);
  const motionSafe = useMotionSafe();
```

3. 在现有"自动滚动到底部"的 `useEffect` 之后,新增:

```tsx
  // 新消息入场:仅对"追加"(长度 +1/+2)且非流式占位的最新一条消息播放一次
  useEffect(() => {
    const len = messages.length;
    if (firstRenderRef.current) {
      messages.forEach((m) => seenIdsRef.current.add(m.id));
      prevLenRef.current = len;
      firstRenderRef.current = false;
      return;
    }
    const delta = len - prevLenRef.current;
    const last = messages[len - 1];
    if (
      motionSafe &&
      delta >= 1 &&
      delta <= 2 &&
      last &&
      !seenIdsRef.current.has(last.id) &&
      last.status !== "streaming" &&
      threadRef.current
    ) {
      const node = threadRef.current.querySelector(`[data-msg-id="${last.id}"]`);
      if (node) {
        gsap.from(node, { opacity: 0, y: 12, duration: 0.35, ease: "power2.out" });
      }
    }
    messages.forEach((m) => seenIdsRef.current.add(m.id));
    prevLenRef.current = len;
  }, [messages, motionSafe]);
```

4. 消息列表容器 div 加 ref 与 data 属性:

```tsx
  return (
    <div ref={threadRef} className="chat-thread" role="log" aria-live="polite" aria-label="聊天消息">
```

5. 每条消息 wrapper 加 `data-msg-id`:

```tsx
        <div
          key={msg.id}
          data-msg-id={msg.id}
          className={`message-wrapper ${msg.role === "user" ? "message-user" : "message-assistant"}`}
        >
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- src/components/chat/chat-thread-entrance.test.tsx`
Expected: 2 passed

- [ ] **Step 5: 验证**

Run: `npm run lint`、`npm run typecheck`、`npm test`(全量,覆盖既有聊天相关测试)。

---

### Task 8: 快捷问题 stagger 弹出

**Files:**
- Modify: `src/components/chat/quick-actions.tsx`
- Test: `src/components/chat/quick-actions.test.tsx`

**Interfaces:**
- Consumes: `useMotionSafe()`(Task 1)
- Produces: `QuickActions` 挂载时对其内部按钮播放一次性 stagger(0.04s/项,320ms 总长);状态翻转(resolved/obsolete)不重播。

- [ ] **Step 1: 写失败测试**

创建 `src/components/chat/quick-actions.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QuickActions } from "./quick-actions";

describe("QuickActions (SSR)", () => {
  it("renders all action buttons visible", () => {
    const html = renderToStaticMarkup(
      <QuickActions
        questionId="q1"
        actions={[
          { id: "a1", label: "查看建议", value: "v1" },
          { id: "a2", label: "继续追问", value: "v2" },
        ]}
        status="pending"
        onSelect={vi.fn()}
      />,
    );
    expect(html).toContain("查看建议");
    expect(html).toContain("继续追问");
    expect(html).not.toContain("opacity:0");
  });

  it("renders nothing when obsolete", () => {
    const html = renderToStaticMarkup(
      <QuickActions
        questionId="q1"
        actions={[{ id: "a1", label: "查看建议", value: "v1" }]}
        status="obsolete"
        onSelect={vi.fn()}
      />,
    );
    expect(html).toBe("");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/components/chat/quick-actions.test.tsx`
Expected: FAIL(找不到测试文件)

- [ ] **Step 3: 修改 `quick-actions.tsx`**

1. import 区改为:

```tsx
"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { cn } from "@/components/ui/cn";
import { useMotionSafe } from "@/lib/motion/motion-safe";
```

2. 组件函数体内,`selectedId` state 之后加:

```tsx
  const listRef = useRef<HTMLDivElement>(null);
  const motionSafe = useMotionSafe();

  // 挂载时对按钮播放一次性 stagger;状态翻转不重播
  useLayoutEffect(() => {
    const root = listRef.current;
    if (!root || !motionSafe) return;
    const ctx = gsap.context(() => {
      gsap.from(root.querySelectorAll("button"), {
        opacity: 0,
        y: 8,
        duration: 0.32,
        ease: "power2.out",
        stagger: 0.04,
      });
    }, root);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionSafe]);
```

3. 根 div 加 ref:

```tsx
    <div
      ref={listRef}
      data-testid="quick-actions"
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- src/components/chat/quick-actions.test.tsx`
Expected: 2 passed

- [ ] **Step 5: 验证**

Run: `npm run lint`、`npm run typecheck`、`npm test`。

---

### Task 9: Kurisu 头像呼吸浮动

**Files:**
- Modify: `src/components/chat/kurisu-avatar.tsx`
- Test: `src/components/chat/kurisu-avatar.test.tsx`

**Interfaces:**
- Consumes: `useMotionSafe()`(Task 1)
- Produces: `.kurisu-avatar` 容器 idle 时呼吸浮动(仅 transform,不影响 Live2D iframe 内部动画);`phase === "waiting"` 时轻微思考倾斜。**speaking 时容器不动**——Live2D 自带说话动作,避免双重动效(设计文档 §5 #4 的口径按此收窄)。

- [ ] **Step 1: 写失败测试**

创建 `src/components/chat/kurisu-avatar.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KurisuAvatar } from "./kurisu-avatar";

describe("KurisuAvatar (SSR)", () => {
  it("renders the Live2D iframe", () => {
    const html = renderToStaticMarkup(<KurisuAvatar />);
    expect(html).toContain("/live2d/index.html");
    expect(html).toContain("kurisu-avatar-frame");
    expect(html).not.toContain("opacity:0");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/components/chat/kurisu-avatar.test.tsx`
Expected: FAIL(找不到测试文件)

- [ ] **Step 3: 修改 `kurisu-avatar.tsx`**

1. import 区改为:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useMotionSafe } from "@/lib/motion/motion-safe";
```

2. 组件函数体内,`prevPhaseRef` 之后加:

```tsx
  const containerRef = useRef<HTMLDivElement>(null);
  const motionSafe = useMotionSafe();
```

3. 在现有 `useEffect(() => () => {...}, [])` 清理轮询的 effect 之后,新增两个 effect:

```tsx
  // 呼吸浮动:仅 idle/waiting 时轻浮;s speaking 时容器不动(Live2D 自带说话动作)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !motionSafe) return;
    const float = gsap.to(el, { y: -6, duration: 2.6, ease: "sine.inOut", yoyo: true, repeat: -1 });
    return () => {
      float.kill();
    };
  }, [motionSafe]);

  // waiting(思考)时的轻微倾斜
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !motionSafe || phase !== "waiting") return;
    const tilt = gsap.to(el, { rotation: 1.5, duration: 0.8, ease: "sine.inOut", yoyo: true, repeat: 3 });
    return () => {
      tilt.kill();
    };
  }, [phase, motionSafe]);
```

4. 根 div 加 ref:

```tsx
    <div ref={containerRef} className="kurisu-avatar" aria-hidden="true">
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- src/components/chat/kurisu-avatar.test.tsx`
Expected: 1 passed

- [ ] **Step 5: 验证**

Run: `npm run lint`、`npm run typecheck`、`npm test`。

---

### Task 10: 候选卡入场与确认沉降

**Files:**
- Modify: `src/components/chat/message-parts.tsx`(入场包裹)
- Modify: `src/components/chat/memory-proposal-card.tsx`(退场)
- Modify: `src/components/chat/agent-artifact-candidate-card.tsx`(沉降)
- Modify: `src/components/chat/profile-candidate-card.tsx`(沉降 + 外层包裹)
- Modify: `src/components/chat/plan-summary-card.tsx`(沉降)
- Modify: `src/components/chat/exploration-report-card.tsx`(沉降)
- Test: `src/components/chat/motion-cards.test.tsx`

**Interfaces:**
- Consumes: `<Reveal>`(Task 3)、`playSettle`/`playExitFade`(Task 4)
- Produces: 五类候选卡到达时 stagger 入场(0.06s/卡);确认/提交后卡片沉降(scale 0.985→1,250ms);记忆提案确认/忽略时先退场(250ms)再卸载。**spec 中"其余淡出"收窄为:被操作卡片自身的按钮随状态切换隐藏,其他待确认卡片不受影响**(各自独立确认,不强加联动)。

- [ ] **Step 1: 写失败测试**

创建 `src/components/chat/motion-cards.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AgentArtifactCandidateCard } from "./agent-artifact-candidate-card";
import { ExplorationReportCard } from "./exploration-report-card";
import { MemoryProposalCard } from "./memory-proposal-card";
import { PlanSummaryCard } from "./plan-summary-card";
import { ProfileCandidateCard } from "./profile-candidate-card";

describe("候选卡 (SSR 冒烟:全部渲染可见)", () => {
  it("AgentArtifactCandidateCard", () => {
    const html = renderToStaticMarkup(
      <AgentArtifactCandidateCard candidateId="c1" candidateType="profile_patch" taskType="profile_assessment" summary="补充证据" />,
    );
    expect(html).toContain("补充证据");
    expect(html).not.toContain("opacity:0");
  });

  it("ProfileCandidateCard", () => {
    const html = renderToStaticMarkup(
      <ProfileCandidateCard
        candidate={{
          id: "c1",
          field: "major",
          oldValue: "计算机",
          newValue: "软件工程",
          confidence: 0.9,
          reason: "依据聊天",
          status: "pending",
          evidenceExcerpt: "聊天记录",
          impactSummary: "画像更准确",
        }}
        onAction={vi.fn(async () => undefined)}
      />,
    );
    expect(html).toContain("软件工程");
  });

  it("PlanSummaryCard", () => {
    const html = renderToStaticMarkup(
      <PlanSummaryCard
        plan={{
          id: "p1",
          targetRole: "data_analyst",
          version: 1,
          status: "active",
          months: [],
          currentMonthIndex: 1,
          generationMeta: { triggeredBy: "user" },
        }}
        diff={null}
        onAcceptReplan={vi.fn(async () => undefined)}
        onViewPlan={vi.fn()}
      />,
    );
    expect(html).toContain("执行本月计划");
  });

  it("MemoryProposalCard", () => {
    const html = renderToStaticMarkup(
      <MemoryProposalCard
        memoryId="m1"
        content="每周学习 10 小时"
        kind="career_fact"
        sensitivity="normal"
        status="pending"
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(html).toContain("每周学习 10 小时");
  });

  it("ExplorationReportCard", () => {
    const html = renderToStaticMarkup(
      <ExplorationReportCard
        report={{
          id: "r1",
          roleName: "数据分析师",
          status: "draft",
          summary: "行业需求旺盛",
          coreCompetencies: ["SQL"],
          entryPaths: ["实习"],
          learningSuggestions: ["刷题"],
          fitAnalysis: ["匹配度较高"],
          sources: [],
        }}
        sourceLabel="AI分析与推断"
        onSubmit={vi.fn(async () => undefined)}
      />,
    );
    expect(html).toContain("行业需求旺盛");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/components/chat/motion-cards.test.tsx`
Expected: FAIL(找不到测试文件;若个别用例因测试数据形状报错,按报错修测试数据,不要改卡组件)

- [ ] **Step 3: message-parts.tsx 入场包裹**

先完整读 `src/components/chat/message-parts.tsx` 的 340-414 行(parts.map 渲染区)。在 import 区加:

```tsx
import { Reveal } from "@/components/ui/reveal";
```

在 parts.map 里,把五类卡的渲染分别包进 `<Reveal variant="card" delay={i * 0.06}>`,其中 `i` 是 parts.map 的索引参数(若现有 map 回调没有索引,改成 `(part, i)`)。仅包卡组件,不包 `QuickActions`/`CitationList`/其他 part。示例:

```tsx
        {part.type === "profile_candidate" && (
          <Reveal variant="card" delay={i * 0.06}>
            <ProfileCandidateCard ... />
          </Reveal>
        )}
```

五类 part 的 type 与组件对应:profile_candidate → `ProfileCandidateCard`、plan_summary → `PlanSummaryCard`、exploration_report → `ExplorationReportCard`、memory_proposal → `MemoryProposalCard`、agent_artifact_candidate → `AgentArtifactCandidateCard`(以实际代码中的 type 字符串为准)。

- [ ] **Step 4: 五个卡组件的沉降/退场修改**

**4a. memory-proposal-card.tsx**(退场后卸载):

1. import 区改为:

```tsx
"use client";

import { useCallback, useRef, useState } from "react";
import { playExitFade } from "@/lib/motion/settle";
```

2. `currentStatus` state 之后加 `const rootRef = useRef<HTMLDivElement>(null);`

3. 替换两个 handler:

```tsx
  const handleAccept = useCallback(() => {
    playExitFade(rootRef.current, () => {
      setCurrentStatus("confirmed");
      onAccept(memoryId);
    });
  }, [memoryId, onAccept]);

  const handleReject = useCallback(() => {
    playExitFade(rootRef.current, () => {
      setCurrentStatus("rejected");
      onReject(memoryId);
    });
  }, [memoryId, onReject]);
```

4. 根 div 加 `ref={rootRef}`。

**4b. agent-artifact-candidate-card.tsx**(确认后沉降):

1. import 区加两行:

```tsx
import { useRef } from "react";
import { playSettle } from "@/lib/motion/settle";
```

2. 组件体内加 `const rootRef = useRef<HTMLDivElement>(null);`

3. `handleDecision` 成功分支中,`setStatus(body.data.status);` 之后加一行:

```tsx
      playSettle(rootRef.current);
```

4. 根 div(class 含 `agent-candidate-card`)加 `ref={rootRef}`。

**4c. profile-candidate-card.tsx**(外层包裹 + 状态变化沉降):

1. import 区改为:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { playSettle } from "@/lib/motion/settle";
```

2. 组件体内加:

```tsx
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status !== "pending") playSettle(rootRef.current);
  }, [status]);
```

3. 把组件的两个 return 分支(pending / 已处理)合并为一个外层 div:

```tsx
  return (
    <div ref={rootRef}>
      {status !== "pending" ? (
        /* 原"已处理状态"分支,原样保留 */
      ) : (
        /* 原"待确认状态"分支,原样保留 */
      )}
    </div>
  );
```

注意合并后原分支各自的 `role="region"`/`aria-label` 保留在原 div 上,外层 div 不添加任何属性。

**4d. plan-summary-card.tsx**(confirmed 沉降):

1. import 区改为:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { playSettle } from "@/lib/motion/settle";
```

2. 组件体内加:

```tsx
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (confirmed) playSettle(rootRef.current);
  }, [confirmed]);
```

3. 根 div(含 `role="region"`)加 `ref={rootRef}`。

**4e. exploration-report-card.tsx**(提交后沉降):

1. import 区改为:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { playSettle } from "@/lib/motion/settle";
```

2. 组件体内加:

```tsx
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isSubmitted) playSettle(rootRef.current);
  }, [isSubmitted]);
```

3. 根 div(含 `role="region"`)加 `ref={rootRef}`。

- [ ] **Step 5: 运行确认通过**

Run: `npm test -- src/components/chat/motion-cards.test.tsx`
Expected: 5 passed(若某卡断言失败,先修测试数据形状,卡组件行为不得破坏)

- [ ] **Step 6: 验证**

Run: `npm run lint`、`npm run typecheck`、`npm test`(全量——重点观察既有 `agent-artifact-candidate-card.test.tsx` 等卡相关测试是否仍绿)。

---

### Task 11: 仪表盘 count-up 与雷达图

**Files:**
- Modify: `src/features/dashboard/dashboard-view.tsx`
- Test: `src/features/dashboard/dashboard-view-motion.test.tsx`

**Interfaces:**
- Consumes: `<CountUp>`(Task 2)、`getMotionSafe()`(Task 1)、`<Reveal>`(Task 3)
- Produces: 指标卡与匹配度数字改为 CountUp 滚动(600ms,首次进视口);雷达图 recharts 动画 600ms、`isAnimationActive={getMotionSafe()}`;`dash-row-2` 两张卡 Reveal 入场。

- [ ] **Step 1: 写失败测试**

创建 `src/features/dashboard/dashboard-view-motion.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DashboardView } from "./dashboard-view";
import type { WorkspaceData } from "@/lib/workspace-types";

function makeData(): WorkspaceData {
  return {
    user: { id: "u1", displayName: "测试用户", username: "tester", role: "user" },
    profile: {
      id: "p1",
      userId: "u1",
      educationStage: null,
      major: "软件工程",
      targetRole: "data_analyst",
      targetRoleLabel: "数据分析师",
      weeklyAvailableHours: 10,
      learningPreference: [],
      experienceSummary: "",
      interestTags: [],
      constraints: [],
      abilityScores: { sql: 72, statistics: 60 },
      memoryEnabled: true,
      onboardingCompleted: true,
      version: 1,
      introStatus: "done",
      updatedAt: "2026-09-03T00:00:00.000Z",
    },
    plan: {
      id: "plan-1",
      targetRole: "data_analyst",
      version: 1,
      status: "active",
      years: [],
      quarters: [],
      months: [],
      currentMonthIndex: 1,
      assumptions: [],
      riskNotes: [],
      generationMeta: {
        requestedMode: "mock",
        actualMode: "mock",
        degraded: false,
        fallbackReason: null,
        source: "runtime-config",
        triggeredBy: "manual",
      },
      sourceReportId: null,
      schemaVersion: 1,
      content: null,
      targetRoleLabel: "数据分析师",
      createdAt: "2026-09-03T00:00:00.000Z",
      updatedAt: "2026-09-03T00:00:00.000Z",
    },
    pendingPlan: null,
    planExecutionMeta: null,
    resources: [],
    memories: [],
    candidates: [],
    v2Candidates: [],
    simulations: [],
    drafts: [],
    templates: [],
    match: { score: 82, explanation: "整体匹配良好", weakAbilities: [] },
    recentProgressLogs: [],
    aiRuntime: { requestedMode: "mock", actualMode: "mock", degraded: false, fallbackReason: null, source: "runtime-config" },
    activeOnboardingConversation: null,
  };
}

describe("DashboardView 动效接入 (SSR)", () => {
  it("renders count-up values and radar chart without inline opacity", () => {
    const html = renderToStaticMarkup(
      <DashboardView data={makeData()} refresh={vi.fn(async () => undefined)} setNotice={vi.fn()} />,
    );
    expect(html).toContain("82");
    expect(html).toContain("能力雷达图");
    expect(html).not.toContain("opacity:0");
  });
});
```

注:以上字段已按 `src/lib/workspace-types.ts`(WorkspaceData)与 `src/lib/types.ts`(ProfileDto / CareerPlanDto / PlanGenerationMeta)的当前定义逐字核对;若 tsc 仍报缺字段,按提示补齐(测试通过优先,不碰组件)。

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/features/dashboard/dashboard-view-motion.test.tsx`
Expected: 先修通测试本身的类型/数据(此步允许迭代测试代码);最终应在某断言上 FAIL(如雷达图区域被 Reveal 包裹前 `能力雷达图` 可能已存在,则以"无 opacity:0"与 CountUp 数值渲染为验收)。

- [ ] **Step 3: 修改 `dashboard-view.tsx`**

1. import 区加三行:

```tsx
import { CountUp } from "@/lib/motion/count-up";
import { getMotionSafe } from "@/lib/motion/motion-safe";
import { Reveal } from "@/components/ui/reveal";
```

2. `Metric` 组件改为数字入参并用 CountUp 渲染(替换整个 Metric 函数):

```tsx
function Metric({ title, value, unit, tone }: { title: string; value: number; unit?: string; tone: "brand" | "success" | "warning" | "danger" }) {
  const dot: Record<string, string> = {
    brand: "var(--cm-brand)", success: "var(--cm-success)", warning: "var(--cm-warning)", danger: "var(--cm-danger)",
  };
  return (
    <div className="cm-metric-card" style={{ padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500, color: "var(--cm-text-muted)" }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: dot[tone] }} aria-hidden="true" />
        {title}
      </div>
      <div style={{ marginTop: 14, display: "flex", alignItems: "baseline", gap: 6 }}>
        <CountUp
          className="cm-mono"
          style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--cm-text-strong)" }}
          value={value}
        />
        {unit ? <span style={{ fontSize: 13, color: "var(--cm-text-subtle)" }}>{unit}</span> : null}
      </div>
    </div>
  );
}
```

3. 两处 `<Metric>` 调用改为数字:

```tsx
          <Metric title="本月任务" value={currentMonth?.learningTasks?.length ?? 0} unit="项" tone="brand" />
          <Metric title="待确认画像" value={pendingCandidateCount} unit="条" tone="warning" />
```

4. 匹配度大数字改为 CountUp:

```tsx
              <CountUp className="cm-match-number" value={data.match?.score ?? 0} />
              <span style={{ fontSize: 26, color: "var(--cm-text-subtle)" }}>%</span>
```

(替换原 `<span className="cm-match-number">{data.match?.score ?? 0}<span ...>%</span></span>` 结构,保持两个兄弟节点。)

5. 雷达图加显式动画参数:

```tsx
                <Radar
                  dataKey="score"
                  name="当前能力"
                  stroke="var(--cm-brand)"
                  strokeWidth={2}
                  fill="var(--cm-brand)"
                  fillOpacity={0.18}
                  isAnimationActive={getMotionSafe()}
                  animationDuration={600}
                  label={{ fontSize: 12, fill: "var(--cm-text-muted)" }}
                />
```

6. `dash-row-2` 的两张 `SurfaceCard` 分别用 Reveal 包裹:

```tsx
      <div className="dash-row-2" data-od-id="dashboard-row-charts">
        <Reveal variant="card">
          <SurfaceCard title="能力雷达图" description="主色为当前能力值" action={...}>...</SurfaceCard>
        </Reveal>
        <Reveal variant="card" delay={0.08}>
          <SurfaceCard title="当前月重点">...</SurfaceCard>
        </Reveal>
      </div>
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- src/features/dashboard/dashboard-view-motion.test.tsx`
Expected: 1 passed

- [ ] **Step 5: 验证**

Run: `npm run lint`、`npm run typecheck`、`npm test`。

---

### Task 12: 发送按钮按压微交互

**Files:**
- Modify: `src/components/chat/chat-composer.tsx`
- Test: `src/components/chat/chat-composer-motion.test.tsx`

**Interfaces:**
- Consumes: `useMotionSafe()`(Task 1)
- Produces: `.send-btn` pointerdown 缩至 0.96(180ms)、释放回弹 `back.out(1.4)`;发送成功后 scale 1→1.03→1(150ms)。不改变按钮的 disabled 逻辑。

- [ ] **Step 1: 写失败测试**

创建 `src/components/chat/chat-composer-motion.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatComposer } from "./chat-composer";

describe("ChatComposer (SSR)", () => {
  it("renders composer and send button without inline opacity", () => {
    const html = renderToStaticMarkup(
      <ChatComposer onSend={vi.fn()} disabled={false} activeConversationId="c1" />,
    );
    expect(html).toContain('class="send-btn"');
    expect(html).toContain("输入你的问题");
    expect(html).not.toContain("opacity:0");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/components/chat/chat-composer-motion.test.tsx`
Expected: FAIL(找不到测试文件)

- [ ] **Step 3: 修改 `chat-composer.tsx`**

1. import 区改为:

```tsx
"use client";

import { useCallback, useRef, useState } from "react";
import gsap from "gsap";
import { Send, Square } from "lucide-react";
import { useMotionSafe } from "@/lib/motion/motion-safe";
```

2. 组件函数体内,`textareaRef` 之后加:

```tsx
  const sendBtnRef = useRef<HTMLButtonElement>(null);
  const motionSafe = useMotionSafe();
```

3. `handleSend` 中 `onSend(trimmed);` 之后、`setText("")` 之前加微冲:

```tsx
    const btn = sendBtnRef.current;
    if (btn && motionSafe) {
      gsap.fromTo(btn, { scale: 1 }, { scale: 1.03, duration: 0.15, ease: "power2.out", yoyo: true, repeat: 1 });
    }
```

4. 新增按压/释放 handler(组件函数体内,任意位置):

```tsx
  const pressSend = useCallback(() => {
    const el = sendBtnRef.current;
    if (!el || !motionSafe) return;
    gsap.to(el, { scale: 0.96, duration: 0.18, ease: "power2.out" });
  }, [motionSafe]);

  const releaseSend = useCallback(() => {
    const el = sendBtnRef.current;
    if (!el || !motionSafe) return;
    gsap.to(el, { scale: 1, duration: 0.22, ease: "back.out(1.4)" });
  }, [motionSafe]);
```

5. 发送按钮加 ref 与指针事件:

```tsx
        <button
          ref={sendBtnRef}
          className="send-btn"
          onClick={handleSend}
          onPointerDown={pressSend}
          onPointerUp={releaseSend}
          onPointerLeave={releaseSend}
          disabled={!text.trim() || disabled || text.trim().length > 8000}
          aria-label={disabled ? "停止生成" : "发送消息"}
        >
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- src/components/chat/chat-composer-motion.test.tsx`
Expected: 1 passed

- [ ] **Step 5: 验证**

Run: `npm run lint`、`npm run typecheck`、`npm test`。

---

### Task 13: 抽屉/侧栏现状核验 + 设计文档指针

**Files:**
- Modify: `DESIGN.md`(仅 §6 加一行指针)
- 无新代码、无新测试

**背景(已探明,直接采信,无需再验证代码)**:`.growth-drawer` 已有 width 过渡 260ms(`--cm-duration-drawer` + `--cm-ease`);移动端 `.chat-sidebar` 已有 translateX 过渡 + `.sidebar-overlay` 已有 `cm-fade 0.2s`;全局 `prefers-reduced-motion` 块已把全部 CSS 动画/过渡压到 0.01ms。**spec §5 #8 的滑入+背景淡入已由 CSS 实现,不再用 GSAP 重做**(违反 Global Constraints 的"CSS 现状保留")。画像抽屉为内嵌面板(宽度过渡推开内容)而非浮层,无需 backdrop。

- [ ] **Step 1: 更新 DESIGN.md**

打开 `DESIGN.md`,在 `## 6. 动效` 小节标题下一行(正文之前)插入:

```markdown
JS 动效(运动层:GSAP 门控、Reveal、CountUp、编排)规范见
`docs/superpowers/specs/2026-09-03-careermate-gsap-motion-design.md`;
本小节"保留/不恢复"清单继续作为运动层的边界。
```

- [ ] **Step 2: 验证文档无破坏**

Run: `npm run lint`、`npm run typecheck`、`npm test`(确认全绿,本任务不应影响代码)。

---

### Task 14: e2e 降级冒烟 + 全量验证 + 视觉走查

**Files:**
- Create: `e2e/motion-reduced.spec.ts`

**Interfaces:**
- Consumes: 前面所有任务产物

- [ ] **Step 1: 了解 e2e 惯例**

先读 `e2e/` 目录下任意一个现有 spec 文件与 `playwright.config.ts`、`scripts/e2e-server.mjs`,搞清:baseURL、登录态如何处理(是否已有 seeded 用户/登录 helper)。新测试照抄其导入与前置约定。

- [ ] **Step 2: 写降级冒烟测试**

创建 `e2e/motion-reduced.spec.ts`(按 Step 1 的惯例调整导入/登录前置):

```ts
import { test, expect } from "@playwright/test";

test.describe("动效降级(reduced motion)", () => {
  test.use({ reducedMotion: "reduce" });

  test("落地页关键元素可见,无透明残留", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".landing-new-title")).toBeVisible();
    await expect(page.locator(".landing-new-badge")).toBeVisible();
    // 检查关键元素没有被动画残留卡在透明态
    const opacity = await page.locator(".landing-new-title").evaluate((el) => getComputedStyle(el).opacity);
    expect(opacity).toBe("1");
  });
});
```

注意:若 e2e 环境默认已登录(落地页会 redirect),把断言对象换成登录后首页的稳定元素(如 `.cm-metric-card` / `[data-testid="app-shell"]`),保留 `reducedMotion: "reduce"` 与"可见且 opacity=1"的核心断言。

- [ ] **Step 3: 运行新 e2e**

Run: `npm run test:e2e -- e2e/motion-reduced.spec.ts`(按仓库 e2e-server 惯例,可能需要先起服务,以 Step 1 摸清的用法为准)
Expected: 通过

- [ ] **Step 4: 全量验证**

依次运行并在每一步确认全绿:

```bash
npm run secret:scan
npm run lint
npm run typecheck
npm run test
npm run test:migrations
npm run build
npm run test:e2e
```

(即 `npm run verify` 的全部组成 + `test:e2e`。)若既有测试失败:先回看本任务之外的任务 diff 定位,不得通过删改既有测试来"修复"。

- [ ] **Step 5: 视觉走查**

1. 运行 `npm run dev`(或 `start-dev.bat`),待启动完成。
2. 读 `work/` 下截图脚本头部的用法说明(已有 `screenshot-ui.mjs`、`screenshot-chat2.mjs`、`screenshot-path.mjs`、`screenshot-resources.mjs` 等),按说明对 `/`、`/login`、`/dashboard`、聊天页执行截图,输出到 `work/shots/`。
3. 人工检查截图:元素可见、无溢出/重叠、无透明残留;对比改动前截图(如 `work/shots/v12-*.png`)确认视觉令牌未漂移。
4. 手动走查交互:聊天发消息看消息入场与快捷问题弹出;接受一张候选卡看沉降;打开/收起成长档案与移动端侧栏看滑入;仪表盘看数字滚动与雷达图描画;DevTools 开启 `prefers-reduced-motion: reduce` 后刷新,确认所有元素直接可见、无动画。

- [ ] **Step 6: 收尾核对**

对照设计文档 `docs/superpowers/specs/2026-09-03-careermate-gsap-motion-design.md` 的 §5 清单逐项核对:9 项场景中除 #8(抽屉/侧栏,CSS 已覆盖,见 Task 13)外全部落地;§6 门控全部到位;§7 验证全部执行。若有偏差,在设计文档 §1 决策记录补一条说明。
