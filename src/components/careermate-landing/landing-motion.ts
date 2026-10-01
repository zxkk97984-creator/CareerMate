/* No framework, requests or generated claims. All demonstrations below are local. */
export function initLanding(root: HTMLElement) {
    const controller = new AbortController();
    const { signal } = controller;
    const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
    const $$ = <T extends HTMLElement = HTMLElement>(s: string) => Array.from(root.querySelectorAll<T>(s));
    const reduced = matchMedia('(prefers-reduced-motion:reduce)');
    const motion = () => !reduced.matches && root.dataset.motionMode !== 'off';
    const featureTabs = $$<HTMLButtonElement>('[data-feature]'), trainingTabs = $$<HTMLButtonElement>('[data-train]');
    const featureKeys = featureTabs.map(t => t.dataset.feature!);
    let feature = featureKeys[0], train = 0, chatFrame = 0, chatStarted = 0;
    let playTimer: ReturnType<typeof setTimeout> | undefined;
    const featureLive = $('[data-feature-live]');
    const animations = new Set<Animation>();
    function animate(el: HTMLElement | null) {
        if (!el || !motion() || !el.animate)
            return;
        for (const animation of el.getAnimations())
            animation.cancel();
        const a = el.animate([{ opacity: .3, transform: 'translateY(9px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 350, easing: 'cubic-bezier(.22,1,.36,1)' });
        animations.add(a);
        a.onfinish = a.oncancel = () => animations.delete(a);
    }
    function selectTabs(tabs: HTMLButtonElement[], index: number) {
        tabs.forEach((t, i) => { const active = i === index; t.setAttribute('aria-selected', String(active)); t.tabIndex = active ? 0 : -1; const panel = $('#' + t.getAttribute('aria-controls')); if (panel)
            panel.hidden = !active; });
    }
    function activateFeature(key: string, focus = false) {
        const index = featureKeys.indexOf(key);
        if (index < 0)
            return;
        finishChat();
        feature = key;
        selectTabs(featureTabs, index);
        const panel = $('#panel-' + key);
        animate(panel);
        $$('[data-preview]').forEach(btn => btn.dataset.active = String(btn.dataset.preview === key));
        if (featureLive)
            featureLive.textContent = '正在展示' + featureTabs[index].textContent.replace(/^\s*\d+\s*/, '').trim() + '示例';
        window.dispatchEvent(new CustomEvent('cm:featurechange'));
        if (focus)
            featureTabs[index].focus({ preventScroll: true });
    }
    function scrollToElement(target: HTMLElement, focus = true) {
        target.scrollIntoView({ behavior: motion() ? 'smooth' : 'instant', block: 'start' });
        if (focus) {
            target.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: true });
        }
    }
    function bindTabs(tabs: HTMLButtonElement[], select: (index: number) => void) {
        tabs.forEach((t, i) => {
            t.addEventListener('click', () => select(i), { signal });
            t.addEventListener('keydown', e => {
                let next = i;
                if (e.key === 'ArrowRight')
                    next = (i + 1) % tabs.length;
                else if (e.key === 'ArrowLeft')
                    next = (i - 1 + tabs.length) % tabs.length;
                else if (e.key === 'Home')
                    next = 0;
                else if (e.key === 'End')
                    next = tabs.length - 1;
                else
                    return;
                e.preventDefault();
                select(next);
                tabs[next].focus();
            }, { signal });
        });
    }
    bindTabs(featureTabs, i => activateFeature(featureKeys[i]));
    $$('[data-preview]').forEach(btn => btn.addEventListener('click', () => {
        activateFeature(btn.dataset.preview!);
        scrollToElement($('#features'), false);
        featureTabs[featureKeys.indexOf(btn.dataset.preview!)].focus({ preventScroll: true });
    }, { signal }));
    // The example confirmation is a reversible UI state, not a write to an account.
    const confirm = $<HTMLButtonElement>('[data-confirm-profile]');
    confirm?.addEventListener('click', () => {
        const selected = confirm.getAttribute('aria-pressed') !== 'true';
        confirm.setAttribute('aria-pressed', String(selected));
        confirm.querySelector('span')!.textContent = selected ? '已确认 · 仅本页演示' : '确认这份示例画像';
        $('[data-confirm-status]').textContent = selected ? '已确认示例；没有创建或保存个人资料。' : '由你确认，再保存为正式画像';
    }, { signal });
    // Playback reveals the existing example, never asks a model or creates new text.
    const reply = $('[data-demo-reply]');
    const replay = $<HTMLButtonElement>('[data-replay-chat]');
    const replyText = reply?.textContent || '';
    function finishChat() {
        cancelAnimationFrame(chatFrame);
        chatFrame = 0;
        if (reply)
            reply.textContent = replyText;
        if (replay) {
            replay.disabled = false;
            replay.querySelector('span')!.textContent = '播放对话示例';
        }
    }
    replay?.addEventListener('click', () => {
        finishChat();
        if (!motion()) {
            animate(reply);
            return;
        }
        reply.style.minHeight = reply.getBoundingClientRect().height + 'px';
        replay.disabled = true;
        replay.querySelector('span')!.textContent = '正在播放示例';
        chatStarted = performance.now();
        function tick(now: number) {
            if (document.hidden || !motion() || feature !== 'profile') {
                finishChat();
                return;
            }
            const count = Math.min(replyText.length, Math.floor((now - chatStarted) / 42));
            reply.textContent = replyText.slice(0, count);
            if (count < replyText.length)
                chatFrame = requestAnimationFrame(tick);
            else
                finishChat();
        }
        chatFrame = requestAnimationFrame(tick);
    }, { signal });
    const tasks = $$<HTMLInputElement>('[data-task]');
    const progress = $('[data-task-progress]');
    function updateTasks() {
        const n = tasks.filter(t => t.checked).length;
        $('.cl-task-status').textContent = '已完成 ' + n + ' / ' + tasks.length + ' 项示例任务';
        progress.setAttribute('aria-valuenow', String(n));
        progress.setAttribute('aria-valuetext', '已完成 ' + n + ' 项，共 ' + tasks.length + ' 项示例任务');
        (progress.firstElementChild as HTMLElement).style.transform = 'scaleX(' + (n / tasks.length) + ')';
    }
    tasks.forEach(t => t.addEventListener('change', updateTasks, { signal }));
    updateTasks();
    const play = $<HTMLButtonElement>('[data-training-play]');
    const nextLabels = ['看看如何对话', '查看反馈示例', '继续讨论报告', '重新查看流程'];
    function stopPlay() {
        clearTimeout(playTimer);
        playTimer = undefined;
        if (play) {
            play.setAttribute('aria-pressed', 'false');
            play.querySelector('span')!.textContent = train === 3 ? '重播流程演示' : '自动演示';
        }
    }
    function selectTraining(index: number, manual = true) {
        if (manual)
            stopPlay();
        train = Math.max(0, Math.min(3, index));
        selectTabs(trainingTabs, train);
        $<HTMLButtonElement>('[data-train-prev]').disabled = train === 0;
        $('.cl-training-counter').textContent = String(train + 1).padStart(2, '0') + ' / 04';
        $('[data-train-next] span').textContent = nextLabels[train];
        animate($('#train-panel-' + train));
    }
    bindTabs(trainingTabs, i => selectTraining(i));
    $('[data-train-prev]').addEventListener('click', () => selectTraining(train - 1), { signal });
    $('[data-train-next]').addEventListener('click', () => selectTraining((train + 1) % 4), { signal });
    play?.addEventListener('click', () => {
        if (playTimer) {
            stopPlay();
            return;
        }
        if (!motion())
            return;
        selectTraining(0, false);
        play.setAttribute('aria-pressed', 'true');
        play.querySelector('span')!.textContent = '暂停演示';
        function advance() { if (!motion() || document.hidden) {
            stopPlay();
            return;
        } if (train === 3) {
            stopPlay();
            return;
        } selectTraining(train + 1, false); playTimer = setTimeout(advance, 4500); }
        playTimer = setTimeout(advance, 4500);
    }, { signal });
    // Mobile navigation and hash navigation retain native destinations.
    const menu = $('.cl-menu-button'), mobile = $('.cl-mobile-nav');
    function closeMenu(focus = false) { mobile.hidden = true; menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', '展开导航'); if (focus)
        menu.focus(); }
    menu.addEventListener('click', () => { const active = menu.getAttribute('aria-expanded') !== 'true'; mobile.hidden = !active; menu.setAttribute('aria-expanded', String(active)); menu.setAttribute('aria-label', active ? '关闭导航' : '展开导航'); }, { signal });
    root.addEventListener('keydown', e => { if (e.key === 'Escape' && !mobile.hidden) {
        closeMenu(true);
    } }, { signal });
    document.addEventListener('pointerdown', e => { if (!mobile.hidden && e.target instanceof Element && !e.target.closest('.cl-header'))
        closeMenu(); }, { signal });
    matchMedia('(min-width:1024px)').addEventListener('change', e => { if (e.matches)
        closeMenu(); }, { signal });
    $$<HTMLAnchorElement>('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
        if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey)
            return;
        const hash = a.getAttribute('href');
        if (!hash || hash === '#')
            return;
        const target = hash === '#top' ? root : $(hash);
        if (!target)
            return;
        e.preventDefault();
        closeMenu();
        scrollToElement(target);
        try {
            history.replaceState(null, '', hash);
        }
        catch { }
    }, { signal }));
    // Visibility driven reveals; no hidden content if motion is disabled or JS is absent.
    const observers: IntersectionObserver[] = [];
    if ('IntersectionObserver' in window) {
        const reveal = new IntersectionObserver(entries => { entries.forEach(e => { if (e.isIntersecting) {
            e.target.classList.add('is-in');
            reveal.unobserve(e.target);
        } }); }, { threshold: .12 });
        $$('.cl-reveal').forEach(el => reveal.observe(el));
        observers.push(reveal);
        const demoObserver = new IntersectionObserver(entries => { if (!entries[0].isIntersecting)
            stopPlay(); });
        demoObserver.observe($('.cl-training-demo'));
        observers.push(demoObserver);
    }
    const journeySteps = $$('[data-journey-step]'), journey = $('.cl-journey-steps'), journeyBar = $('.cl-journey-progress-fill');
    const nav = $$('[data-nav]');
    const sections = nav.map(a => $('#' + a.dataset.nav));
    let scrollFrame = 0;
    function updateScroll() {
        scrollFrame = 0;
        const vh = innerHeight, scrollY = window.scrollY;
        const maximum = document.documentElement.scrollHeight - innerHeight;
        root.style.setProperty('--read-progress', Math.max(0, Math.min(1, scrollY / Math.max(1, maximum))).toFixed(5));
        $('.cl-header').dataset.scrolled = String(scrollY > 12);
        let active = -1;
        sections.forEach((s, i) => { if (s) {
            const r = s.getBoundingClientRect();
            if (r.top < vh * .36 && r.bottom > Math.min(vh * .36, 180))
                active = i;
        } });
        nav.forEach((a, i) => { if (i === active)
            a.setAttribute('aria-current', 'location');
        else
            a.removeAttribute('aria-current'); });
        if (journey) {
            const rect = journey.getBoundingClientRect();
            const p = Math.max(.03, Math.min(1, (vh * .63 - rect.top) / Math.max(1, rect.height - vh * .24)));
            journeyBar.style.transform = 'scaleX(' + p + ')';
            let step = 0;
            journeySteps.forEach((s, i) => { if (s.getBoundingClientRect().top < vh * .58)
                step = i; });
            journeySteps.forEach((s, i) => s.dataset.stepActive = String(i === step));
        }
    }
    function requestScroll() { if (!scrollFrame)
        scrollFrame = requestAnimationFrame(updateScroll); }
    window.addEventListener('scroll', requestScroll, { passive: true, signal });
    window.addEventListener('resize', requestScroll, { passive: true, signal });
    function motionChanged() {
        if (!motion()) {
            stopPlay();
            finishChat();
            animations.forEach(a => a.cancel());
        }
        if (play)
            play.disabled = !motion();
        requestScroll();
    }
    window.addEventListener('cm:motionchange', motionChanged, { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) {
        stopPlay();
        finishChat();
    }
    else
        requestScroll(); }, { signal });
    window.addEventListener('pagehide', () => { stopPlay(); finishChat(); cancelAnimationFrame(scrollFrame); scrollFrame = 0; }, { signal });
    window.addEventListener('pageshow', requestScroll, { signal });
    activateFeature('profile');
    selectTraining(0);
    updateScroll();
    motionChanged();
    const stopFeedback = initLandingFeedback(root);
    return () => { controller.abort(); stopPlay(); finishChat(); cancelAnimationFrame(scrollFrame); observers.forEach(o => o.disconnect()); animations.forEach(a => a.cancel()); stopFeedback(); };
}
/* Fine-grained UI feedback; no network, credentials, or business data persistence. */
function initLandingFeedback(root: HTMLElement) {
    const controller = new AbortController();
    const { signal } = controller;
    const reduced = matchMedia('(prefers-reduced-motion:reduce)');
    const moving = () => !reduced.matches && root.dataset.motionMode !== 'off';
    const rail = root.querySelector<HTMLElement>('.cl-feature-tabs')!;
    const marker = document.createElement('span');
    marker.className = 'v6-tab-indicator';
    marker.setAttribute('aria-hidden', 'true');
    rail.prepend(marker);
    let frame = 0;
    function placeMarker() {
        frame = 0;
        const button = rail.querySelector<HTMLElement>('[aria-selected="true"]');
        if (!button || !rail.clientWidth)
            return;
        const x = button.offsetLeft, y = button.offsetTop;
        marker.style.width = button.offsetWidth + 'px';
        marker.style.height = button.offsetHeight + 'px';
        marker.style.transform = `translate(${x}px,${y}px)`;
        rail.classList.add('has-indicator');
    }
    function schedule() { if (!frame)
        frame = requestAnimationFrame(placeMarker); }
    window.addEventListener('cm:featurechange', schedule, { signal });
    window.addEventListener('cm:motionchange', schedule, { signal });
    window.addEventListener('resize', schedule, { passive: true, signal });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    ro?.observe(rail);
    placeMarker();
    // Native details remain usable with no JavaScript. Animate height only after deliberate activation.
    const states: Array<{
        details: HTMLDetailsElement;
        animation: Animation | null;
        open: boolean;
    }> = [];
    root.querySelectorAll<HTMLDetailsElement>('.cl-faq-list details').forEach(details => {
        const summary = details.querySelector('summary')!;
        const state: typeof states[number] = { details, animation: null, open: details.open };
        states.push(state);
        function settle() { if (state.animation) {
            state.animation.cancel();
            state.animation = null;
        } details.open = state.open; details.style.height = ''; details.style.overflow = ''; }
        summary.addEventListener('click', e => {
            if (!moving() || !details.animate)
                return;
            e.preventDefault();
            const from = details.getBoundingClientRect().height;
            if (state.animation) {
                state.animation.cancel();
                state.animation = null;
            }
            state.open = !state.open;
            details.style.height = '';
            details.open = true;
            const to = state.open ? details.getBoundingClientRect().height : summary.getBoundingClientRect().height + 2;
            details.style.overflow = 'hidden';
            const a = details.animate([{ height: from + 'px' }, { height: to + 'px' }], { duration: 280, easing: 'cubic-bezier(.22,1,.36,1)' });
            state.animation = a;
            a.onfinish = () => { state.animation = null; details.open = state.open; details.style.height = ''; details.style.overflow = ''; };
        }, { signal });
        details.addEventListener('toggle', () => { if (!state.animation)
            state.open = details.open; }, { signal });
        window.addEventListener('cm:motionchange', () => { if (!moving())
            settle(); }, { signal });
    });
    window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); states.forEach(s => { s.animation?.cancel(); s.details.open = s.open; s.details.style.height = ''; s.details.style.overflow = ''; }); }, { signal });
    return () => { controller.abort(); ro?.disconnect(); cancelAnimationFrame(frame); marker.remove(); states.forEach(s => { s.animation?.cancel(); s.details.style.height = ''; s.details.style.overflow = ''; }); };
}
