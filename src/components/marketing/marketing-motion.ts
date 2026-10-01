/* Pointer ambience and short meteor trail from the supplied design.
   Full motion by default, with OS preference, input-zone and lifecycle guards. */
function initLandingMeteor(root: HTMLElement) {
    const canvas = document.createElement("canvas");
    canvas.className = "cl-meteor-trail";
    canvas.setAttribute("aria-hidden", "true");
    let candidate = null;
    try {
        candidate = canvas.getContext("2d");
    }
    catch {
        return () => undefined;
    }
    if (!candidate)
        return () => undefined;
    const ctx = candidate;
    const settings = { lifetime: 210, maxLength: 100, maxPoints: 30, headRadius: 1.6 };
    const color = getComputedStyle(root).getPropertyValue("--cl-blue-rgb").trim() || "14,118,255";
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const controller = new AbortController();
    const { signal } = controller;
    let points: Array<{
        x: number;
        y: number;
        time: number;
    }> = [];
    let frame = 0, width = 0, height = 0;
    let stopped = false, inView = true;
    root.appendChild(canvas);
    function enabled() { return !stopped && inView && !document.hidden && !reduced.matches && fine.matches && root.dataset.motionMode === "full"; }
    function clear() {
        cancelAnimationFrame(frame);
        frame = 0;
        points = [];
        ctx.clearRect(0, 0, width, height);
    }
    function resize() {
        clear();
        canvas.hidden = !enabled();
        if (!enabled()) {
            canvas.width = canvas.height = 1;
            return;
        }
        width = window.innerWidth;
        height = window.innerHeight;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    function draw(now: number) {
        frame = 0;
        if (!enabled()) {
            clear();
            return;
        }
        ctx.clearRect(0, 0, width, height);
        points = points.filter(point => now - point.time < settings.lifetime);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (let i = 1; i < points.length; i++) {
            const previous = points[i - 1], point = points[i];
            const life = Math.max(0, 1 - (now - point.time) / settings.lifetime);
            const taper = i / Math.max(1, points.length - 1);
            const strength = life * taper;
            ctx.beginPath();
            ctx.moveTo(previous.x, previous.y);
            ctx.lineTo(point.x, point.y);
            ctx.strokeStyle = "rgba(" + color + "," + (strength * .10) + ")";
            ctx.lineWidth = 10 * strength + .5;
            ctx.stroke();
            ctx.strokeStyle = "rgba(" + color + "," + (strength * .7) + ")";
            ctx.lineWidth = 3 * strength + .2;
            ctx.stroke();
        }
        const head = points[points.length - 1];
        if (head && points.length > 1) {
            const life = Math.max(0, 1 - (now - head.time) / settings.lifetime);
            ctx.beginPath();
            ctx.arc(head.x, head.y, settings.headRadius * life, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(" + color + "," + life * .8 + ")";
            ctx.fill();
            ctx.beginPath();
            ctx.arc(head.x, head.y, life, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255,255,255," + life + ")";
            ctx.fill();
        }
        if (points.length)
            frame = requestAnimationFrame(draw);
    }
    root.addEventListener("pointermove", (event) => {
        if (!enabled() || event.pointerType === "touch")
            return;
        if (event.target instanceof Element && event.target.closest("input,textarea,select,button,a,summary,.cl-workspace,.cl-training-demo,.cm-auth-panel,.v3-motion")) {
            clear();
            return;
        }
        const now = performance.now();
        const last = points[points.length - 1];
        if (last && now - last.time > 90)
            points = [];
        else if (last && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 2)
            return;
        points.push({ x: event.clientX, y: event.clientY, time: now });
        if (points.length > settings.maxPoints)
            points.shift();
        let length = 0;
        for (let i = points.length - 1; i > 0; i--) {
            length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
            if (length > settings.maxLength) {
                points = points.slice(i);
                break;
            }
        }
        if (!frame)
            frame = requestAnimationFrame(draw);
    }, { signal, passive: true });
    root.addEventListener("pointercancel", clear, { signal });
    window.addEventListener("blur", clear, { signal });
    root.addEventListener("pointerleave", clear, { signal });
    window.addEventListener("cm:motionchange", resize, { signal });
    window.addEventListener("scroll", clear, { signal, passive: true });
    window.addEventListener("resize", resize, { signal, passive: true });
    document.addEventListener("visibilitychange", resize, { signal });
    reduced.addEventListener("change", resize, { signal });
    fine.addEventListener("change", resize, { signal });
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
        const visible = entries[0]?.isIntersecting ?? false;
        if (visible !== inView) {
            inView = visible;
            resize();
        }
    });
    observer?.observe(root);
    resize();
    return () => { stopped = true; controller.abort(); observer?.disconnect(); clear(); canvas.remove(); };
}
function initLandingBackground(root: HTMLElement) {
    const layer = root.querySelector<HTMLElement>(".cl-ambient-background");
    if (!layer)
        return () => undefined;
    const background = layer;
    const controller = new AbortController();
    const { signal } = controller;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    let frame = 0;
    let targetX = 0, targetY = 0, currentX = 0, currentY = 0;
    let previousTime = 0;
    let inView = true;
    let stopped = false;
    const properties = ["--cl-bg-x", "--cl-bg-y", "--cl-bg-gx", "--cl-bg-gy", "--cl-bg-ox", "--cl-bg-oy"];
    function allowed() { return !stopped && !reduced.matches && pointer.matches && !document.hidden && inView && root.dataset.motionMode !== "off"; }
    function paint() {
        const nx = currentX / Math.max(1, window.innerWidth / 2);
        const ny = currentY / Math.max(1, window.innerHeight / 2);
        [currentX, currentY, nx * -12 * 1, ny * -12 * 1, nx * 24, ny * 20].forEach((value, index) => {
            background.style.setProperty(properties[index], value.toFixed(2) + "px");
        });
    }
    function tick(time: number) {
        frame = 0;
        if (!allowed())
            return;
        const elapsed = previousTime ? Math.min(time - previousTime, 48) : 16;
        previousTime = time;
        const blend = 1 - Math.exp(-elapsed / 55);
        currentX += (targetX - currentX) * blend;
        currentY += (targetY - currentY) * blend;
        const settled = Math.abs(currentX - targetX) + Math.abs(currentY - targetY) < .25;
        if (settled) {
            currentX = targetX;
            currentY = targetY;
        }
        paint();
        if (!settled)
            schedule();
        else
            previousTime = 0;
    }
    function schedule() { if (!frame && allowed())
        frame = requestAnimationFrame(tick); }
    function reset() {
        cancelAnimationFrame(frame);
        frame = previousTime = 0;
        targetX = targetY = currentX = currentY = 0;
        delete root.dataset.bgActive;
        properties.forEach(name => background.style.removeProperty(name));
    }
    root.addEventListener("pointermove", (event) => {
        if (!allowed() || event.pointerType === "touch")
            return;
        if (event.target instanceof Element && event.target.closest("input,textarea,select,button,a,summary,.cl-workspace,.cl-training-demo,.cm-auth-panel,.v3-motion")) {
            leave();
            return;
        }
        targetX = Math.max(-window.innerWidth / 2, Math.min(window.innerWidth / 2, event.clientX - window.innerWidth / 2));
        targetY = Math.max(-window.innerHeight / 2, Math.min(window.innerHeight / 2, event.clientY - window.innerHeight / 2));
        root.dataset.bgActive = "true";
        schedule();
    }, { signal, passive: true });
    function leave() { targetX = targetY = 0; delete root.dataset.bgActive; schedule(); }
    root.addEventListener("pointerleave", leave, { signal });
    root.addEventListener("pointercancel", leave, { signal });
    window.addEventListener("blur", reset, { signal });
    window.addEventListener("cm:motionchange", reset, { signal });
    window.addEventListener("resize", reset, { signal, passive: true });
    document.addEventListener("visibilitychange", reset, { signal });
    reduced.addEventListener("change", reset, { signal });
    pointer.addEventListener("change", reset, { signal });
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
        inView = entries[0]?.isIntersecting ?? false;
        if (!inView)
            reset();
    });
    observer?.observe(root);
    return () => { stopped = true; controller.abort(); observer?.disconnect(); reset(); };
}
/** Full decoration by default; OS reduced motion and background tabs stop animation. */
export function initMarketingMotion(root: HTMLElement) {
    const controller = new AbortController();
    const { signal } = controller;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    function update() {
        root.dataset.motionMode = reduced.matches ? 'off' : 'full';
        root.dataset.motionSleeping = String(document.hidden);
        window.dispatchEvent(new CustomEvent('cm:motionchange'));
    }
    reduced.addEventListener('change', update, { signal });
    document.addEventListener('visibilitychange', update, { signal });
    window.addEventListener('pageshow', update, { signal });
    update();
    const backgroundCleanup = initLandingBackground(root);
    const meteorCleanup = initLandingMeteor(root);
    const sceneCleanups: Array<() => void> = [];
    root.querySelectorAll<HTMLElement>('.v2-scene').forEach(scene => {
        const inner = scene.querySelector<HTMLElement>('.v2-scene-inner')!;
        const pointerZone = scene.closest<HTMLElement>('.cm-auth-intro') || scene;
        let targetX = 0, targetY = 0, x = 0, y = 0, raf = 0, last = 0, visible = true;
        function allowed() { return root.dataset.motionMode !== 'off' && !reduced.matches && fine.matches && !document.hidden && visible; }
        function tick(now: number) {
            raf = 0;
            if (!allowed())
                return;
            const dt = last ? Math.min(now - last, 45) : 16;
            last = now;
            const ease = 1 - Math.exp(-dt / 110);
            x += (targetX - x) * ease;
            y += (targetY - y) * ease;
            inner.style.setProperty('--scene-x', x.toFixed(3) + 'px');
            inner.style.setProperty('--scene-y', y.toFixed(3) + 'px');
            if (Math.abs(x - targetX) + Math.abs(y - targetY) > .015)
                raf = requestAnimationFrame(tick);
            else
                last = 0;
        }
        function request() { if (!raf && allowed())
            raf = requestAnimationFrame(tick); }
        function reset() { cancelAnimationFrame(raf); raf = last = 0; x = y = targetX = targetY = 0; inner.style.removeProperty('--scene-x'); inner.style.removeProperty('--scene-y'); }
        function move(e: PointerEvent) {
            if (!allowed() || e.pointerType === 'touch')
                return;
            const rect = pointerZone.getBoundingClientRect();
            const strength = 10;
            targetX = Math.max(-1, Math.min(1, (e.clientX - rect.left) / rect.width * 2 - 1)) * strength;
            targetY = Math.max(-1, Math.min(1, (e.clientY - rect.top) / rect.height * 2 - 1)) * strength * .65;
            request();
        }
        function leave() { targetX = targetY = 0; request(); }
        pointerZone.addEventListener('pointermove', move, { passive: true });
        pointerZone.addEventListener('pointerleave', leave);
        window.addEventListener('cm:motionchange', reset);
        fine.addEventListener('change', reset);
        window.addEventListener('blur', reset);
        let observer: IntersectionObserver | null = null;
        if ('IntersectionObserver' in window) {
            observer = new IntersectionObserver(entries => {
                visible = entries[0].isIntersecting;
                scene.dataset.sceneVisible = String(visible);
                if (!visible)
                    reset();
            });
            observer.observe(scene);
        }
        sceneCleanups.push(() => { reset(); observer?.disconnect(); pointerZone.removeEventListener('pointermove', move); pointerZone.removeEventListener('pointerleave', leave); window.removeEventListener('cm:motionchange', reset); fine.removeEventListener('change', reset); window.removeEventListener('blur', reset); });
    });
    return () => {
        controller.abort();
        backgroundCleanup();
        meteorCleanup();
        sceneCleanups.forEach(cleanup => cleanup());
    };
}
