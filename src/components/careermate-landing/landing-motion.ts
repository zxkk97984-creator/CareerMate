/** Scoped interactions and progressive motion for the CareerMate introduction. */
export function initLanding(root: HTMLElement): () => void {
  const controller = new AbortController();
  const signal = controller.signal;
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const wideScreen = window.matchMedia('(min-width: 768px)');
  const featureButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-feature]'));
  const trainingButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-train]'));
  let trainingIndex = 0;

  function activateTab(buttons: HTMLButtonElement[], index: number, focus = false): void {
    buttons.forEach((button, current) => {
      const selected = current === index;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      const panel = root.querySelector<HTMLElement>('#' + button.getAttribute('aria-controls'));
      if (panel) panel.hidden = !selected;
    });
    if (focus) buttons[index]?.focus();
  }

  function bindTabs(buttons: HTMLButtonElement[], select: (index: number) => void): void {
    buttons.forEach((button, index) => {
      button.addEventListener('click', () => select(index), { signal });
      button.addEventListener('keydown', (event: KeyboardEvent) => {
        let next = index;
        if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
        else if (event.key === 'ArrowLeft') next = (index + buttons.length - 1) % buttons.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = buttons.length - 1;
        else return;
        event.preventDefault();
        select(next);
        buttons[next]?.focus();
      }, { signal });
    });
  }

  bindTabs(featureButtons, (index) => activateTab(featureButtons, index));
  const previousButton = root.querySelector<HTMLButtonElement>('[data-train-prev]');
  const nextButton = root.querySelector<HTMLButtonElement>('[data-train-next]');
  const counter = root.querySelector<HTMLElement>('.cl-training-counter');
  const nextLabels = ['看看如何对话', '查看反馈示例', '继续讨论报告', '重新查看流程'];
  function selectTraining(index: number): void {
    trainingIndex = Math.max(0, Math.min(trainingButtons.length - 1, index));
    activateTab(trainingButtons, trainingIndex);
    if (previousButton) previousButton.disabled = trainingIndex === 0;
    if (counter) counter.textContent = String(trainingIndex + 1).padStart(2, '0') + ' / 04';
    const label = nextButton?.querySelector('span');
    if (label) label.textContent = nextLabels[trainingIndex];
  }
  bindTabs(trainingButtons, selectTraining);
  previousButton?.addEventListener('click', () => selectTraining(trainingIndex - 1), { signal });
  nextButton?.addEventListener('click', () => selectTraining((trainingIndex + 1) % 4), { signal });

  const tasks = Array.from(root.querySelectorAll<HTMLInputElement>('[data-task]'));
  const taskStatus = root.querySelector<HTMLElement>('.cl-task-status');
  tasks.forEach((task) => task.addEventListener('change', () => {
    const completed = tasks.filter((item) => item.checked).length;
    if (taskStatus) taskStatus.textContent = '已完成 ' + completed + ' / ' + tasks.length + ' 项示例任务';
  }, { signal }));

  const menuButton = root.querySelector<HTMLButtonElement>('.cl-menu-button');
  const mobileNav = root.querySelector<HTMLElement>('.cl-mobile-nav');
  function closeMenu(restoreFocus = false): void {
    if (mobileNav) mobileNav.hidden = true;
    menuButton?.setAttribute('aria-expanded', 'false');
    menuButton?.setAttribute('aria-label', '展开导航');
    if (restoreFocus) menuButton?.focus();
  }
  menuButton?.addEventListener('click', () => {
    const expanded = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!expanded));
    menuButton.setAttribute('aria-label', expanded ? '展开导航' : '关闭导航');
    if (mobileNav) mobileNav.hidden = expanded;
  }, { signal });
  root.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape' && menuButton?.getAttribute('aria-expanded') === 'true') closeMenu(true);
  }, { signal });
  document.addEventListener('pointerdown', (event: PointerEvent) => {
    if (mobileNav && !mobileNav.hidden && event.target instanceof Node && !mobileNav.contains(event.target) && !menuButton?.contains(event.target)) closeMenu();
  }, { signal });
  wideScreen.addEventListener('change', () => { if (wideScreen.matches) closeMenu(); }, { signal });

  root.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event: MouseEvent) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const hash = link.getAttribute('href');
      if (!hash || hash === '#') return;
      const target = hash === '#top' ? root : root.querySelector<HTMLElement>(hash);
      if (!target) return;
      event.preventDefault();
      closeMenu();
      target.scrollIntoView({ behavior: motionPreference.matches ? 'auto' : 'smooth', block: 'start' });
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      try { window.history.replaceState(null, '', hash); } catch { /* Embedded hosts may own history. */ }
    }, { signal });
  });

  const observers: IntersectionObserver[] = [];
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    root.querySelectorAll('.cl-reveal').forEach((element) => revealObserver.observe(element));
    observers.push(revealObserver);
    const navLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-nav]'));
    const navObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((link) => {
          if (link.dataset.nav === entry.target.id) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-15% 0px -55% 0px', threshold: 0 });
    ['journey', 'features', 'practice'].forEach((id) => {
      const section = root.querySelector('#' + id);
      if (section) navObserver.observe(section);
    });
    observers.push(navObserver);
  }

  const stage = root.querySelector<HTMLElement>('.cl-orbit-stage');
  const canvas = root.querySelector<HTMLCanvasElement>('.cl-orbit-canvas');
  const fallback = root.querySelector<SVGElement>('.cl-orbit-fallback');
  const journey = root.querySelector<HTMLElement>('.cl-journey-steps');
  const journeyProgress = root.querySelector<HTMLElement>('.cl-journey-progress-fill');
  const hero = root.querySelector<HTMLElement>('.cl-hero');
  let context: CanvasRenderingContext2D | null = null;
  try { context = canvas?.getContext('2d', { alpha: true }) ?? null; } catch { context = null; }
  let frame = 0;
  let visible = true;
  let disposed = false;
  let width = 0;
  let height = 0;
  let targetX = 0;
  let targetY = 0;
  let pointerX = 0;
  let pointerY = 0;
  let introStart = performance.now();
  let introDone = false;
  const style = getComputedStyle(root);
  const blueRGB = style.getPropertyValue('--cl-blue-rgb').trim();
  const nodeRGB = style.getPropertyValue('--cl-node-rgb').trim();
  const wireRGB = style.getPropertyValue('--cl-wire-rgb').trim();
  const blueColor = style.getPropertyValue('--cl-blue').trim();
  const lineColor = style.getPropertyValue('--cl-route-muted').trim();
  const surfaceColor = style.getPropertyValue('--cl-surface').trim();
  const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

  function queueFrame(): void {
    if (!frame && !disposed && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function resize(): void {
    if (!stage || !canvas || !context) return;
    const bounds = stage.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    queueFrame();
  }

  function draw(now: number, scrollProgress: number): void {
    if (!context || !canvas || width < 1 || height < 1 || motionPreference.matches) return;
    const ctx = context;
    const scale = Math.min(width, height) / 510;
    const intro = clamp((now - introStart) / 360);
    const reveal = 1 - Math.pow(1 - intro, 3);
    introDone = intro >= 1;
    ctx.clearRect(0, 0, width, height);
    const rotateX = -0.76 + pointerY * 0.16;
    const rotateY = 0.42 + pointerX * 0.22 + scrollProgress * 0.3;
    const rotateZ = -0.36 + pointerX * 0.06;

    function project(x: number, y: number, z: number): { x: number; y: number; depth: number } {
      const y1 = y * Math.cos(rotateX) - z * Math.sin(rotateX);
      const z1 = y * Math.sin(rotateX) + z * Math.cos(rotateX);
      const x2 = x * Math.cos(rotateY) + z1 * Math.sin(rotateY);
      const z2 = -x * Math.sin(rotateY) + z1 * Math.cos(rotateY);
      const x3 = x2 * Math.cos(rotateZ) - y1 * Math.sin(rotateZ);
      const y3 = x2 * Math.sin(rotateZ) + y1 * Math.cos(rotateZ);
      const perspective = 670 / (670 + z2);
      return { x: width * 0.5 + x3 * perspective * scale, y: height * 0.49 + y3 * perspective * scale, depth: z2 };
    }

    // Clear space keeps the route legible against the same light canvas as the workspace.
    // One continuous wire surface: a tilted torus, with a route through its open center.
    for (let ring = 0; ring < 40; ring++) {
      const minorAngle = ring / 40 * Math.PI * 2;
      const radius = (148 + 57 * Math.cos(minorAngle)) * (1.04 - 0.04 * reveal);
      ctx.beginPath();
      for (let segment = 0; segment <= 104; segment++) {
        const angle = segment / 104 * Math.PI * 2;
        const point = project(radius * Math.cos(angle), radius * Math.sin(angle), 57 * Math.sin(minorAngle));
        if (segment === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      }
      const highlight = ring % 8 === 0;
      const alpha = highlight ? 0.34 : 0.055 + (Math.sin(minorAngle) + 1) * 0.045;
      ctx.strokeStyle = 'rgba(' + (highlight ? wireRGB : blueRGB) + ',' + alpha * (0.6 + 0.4 * reveal) + ')';
      ctx.lineWidth = highlight ? 0.85 : 0.6;
      ctx.stroke();
    }
    for (let meridian = 0; meridian < 36; meridian++) {
      const angle = meridian / 36 * Math.PI * 2;
      ctx.beginPath();
      for (let segment = 0; segment <= 40; segment++) {
        const minorAngle = segment / 40 * Math.PI * 2;
        const radius = (148 + 57 * Math.cos(minorAngle)) * (1.04 - 0.04 * reveal);
        const point = project(radius * Math.cos(angle), radius * Math.sin(angle), 57 * Math.sin(minorAngle));
        if (segment === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      }
      ctx.strokeStyle = 'rgba(' + wireRGB + ',0.1)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    for (let i = 0; i < 56; i++) {
      const angle = i / 56 * Math.PI * 2;
      const minorAngle = (i * 2.39996) % (Math.PI * 2);
      const radius = (148 + 57 * Math.cos(minorAngle)) * (1.04 - 0.04 * reveal);
      const point = project(radius * Math.cos(angle), radius * Math.sin(angle), 57 * Math.sin(minorAngle));
      const depthAlpha = clamp((170 - point.depth) / 340, 0.28, 0.82);
      ctx.fillStyle = 'rgba(' + (i % 4 === 0 ? nodeRGB : wireRGB) + ',' + depthAlpha + ')';
      ctx.beginPath();
      ctx.arc(point.x, point.y, (i % 9 === 0 ? 1.65 : 0.85) * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    function routePoint(t: number): { x: number; y: number; depth: number } {
      return project(-202 + 404 * t, 90 - 176 * t - Math.sin(t * Math.PI * 2) * 47, -55 + 110 * t);
    }
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const point = routePoint(i / 100);
      if (!i) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.25;
    ctx.stroke();
    const routeReveal = clamp(0.72 + scrollProgress * 0.28) * reveal;
    ctx.beginPath();
    for (let i = 0; i <= Math.ceil(routeReveal * 100); i++) {
      const point = routePoint(Math.min(i / 100, routeReveal));
      if (!i) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
    }
    ctx.strokeStyle = blueColor;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    [0, 0.34, 0.68, 1].forEach((t, index) => {
      const point = routePoint(t);
      ctx.beginPath();
      ctx.arc(point.x, point.y, (index === 0 || index === 3 ? 5 : 3) * scale, 0, Math.PI * 2);
      ctx.fillStyle = t <= routeReveal ? blueColor : lineColor;
      ctx.fill();
      if (index === 0 || index === 3) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 11 * scale, 0, Math.PI * 2);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(' + wireRGB + ',0.42)';
        ctx.stroke();
      }
    });
    const tip = routePoint(routeReveal);
    ctx.fillStyle = surfaceColor;
    ctx.strokeStyle = blueColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 4.5 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (fallback) fallback.style.visibility = 'hidden';
  }

  function tick(now: number): void {
    frame = 0;
    if (disposed || document.hidden) return;
    if (journey && journeyProgress) {
      const rect = journey.getBoundingClientRect();
      const progress = clamp((window.innerHeight * 0.65 - rect.top) / Math.max(1, rect.height - window.innerHeight * 0.3), 0.12, 1);
      journeyProgress.style.transform = 'scaleX(' + progress + ')';
    }
    if (!visible || motionPreference.matches || !context) return;
    pointerX += (targetX - pointerX) * 0.24;
    pointerY += (targetY - pointerY) * 0.24;
    const bounds = hero?.getBoundingClientRect();
    const scrollProgress = bounds ? clamp(-bounds.top / Math.max(1, bounds.height)) : 0;
    draw(now, scrollProgress);
    if (!introDone || Math.abs(targetX - pointerX) > 0.001 || Math.abs(targetY - pointerY) > 0.001) queueFrame();
  }

  stage?.addEventListener('pointermove', (event: PointerEvent) => {
    if (!finePointer.matches || motionPreference.matches || !stage) return;
    const bounds = stage.getBoundingClientRect();
    targetX = clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, -1, 1);
    targetY = clamp((event.clientY - bounds.top) / bounds.height * 2 - 1, -1, 1);
    queueFrame();
  }, { signal, passive: true });
  stage?.addEventListener('pointerleave', () => { targetX = 0; targetY = 0; queueFrame(); }, { signal });
  window.addEventListener('scroll', queueFrame, { signal, passive: true });
  window.addEventListener('resize', resize, { signal, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else queueFrame();
  }, { signal });
  motionPreference.addEventListener('change', () => {
    if (motionPreference.matches) {
      cancelAnimationFrame(frame);
      frame = 0;
      if (canvas) canvas.hidden = true;
      if (fallback) fallback.style.visibility = 'visible';
    } else {
      if (canvas) canvas.hidden = false;
      introStart = performance.now();
      introDone = false;
      resize();
    }
    queueFrame();
  }, { signal });

  if ('IntersectionObserver' in window && stage) {
    const stageObserver = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? false;
      if (visible) queueFrame();
    }, { threshold: 0 });
    stageObserver.observe(stage);
    observers.push(stageObserver);
  }
  let sizeObserver: ResizeObserver | null = null;
  if ('ResizeObserver' in window && stage) {
    sizeObserver = new ResizeObserver(resize);
    sizeObserver.observe(stage);
  }
  if (canvas) canvas.hidden = motionPreference.matches || !context;
  resize();
  queueFrame();

  return () => {
    disposed = true;
    controller.abort();
    cancelAnimationFrame(frame);
    observers.forEach((observer) => observer.disconnect());
    sizeObserver?.disconnect();
    if (fallback) fallback.style.visibility = 'visible';
    context?.clearRect(0, 0, width, height);
  };
}
