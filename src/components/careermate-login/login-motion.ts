export type AuthMode = "login" | "register";
export type FieldName = "username" | "displayName" | "password";
export type AuthFields = Record<FieldName, string>;
export type FieldErrors = Partial<Record<FieldName, string>>;

// Existing application demo accounts; availability depends on the target database.
export const DEMO_ACCOUNTS = [
  { label: "学生小林", username: "student_lin" },
  { label: "学生小陈", username: "student_chen" },
  { label: "学生小吴", username: "student_wu" },
  { label: "职场赵哥", username: "worker_zhao" },
  { label: "转行李哥", username: "career_switch_li" },
  { label: "管理员", username: "admin" },
] as const;
export const DEMO_PASSWORD = "careermate123";
export const FIELD_LABELS: Record<FieldName, string> = { username: "账号", displayName: "昵称", password: "密码" };

/** Match the existing API schemas without trimming or changing submitted credentials. */
export function validateField(mode: AuthMode, name: FieldName, value: string): string {
  if (name === "displayName") {
    if (mode === "login") return "";
    if (!value.length) return "请输入昵称";
    return value.length > 32 ? "昵称最多32个字符" : "";
  }
  if (name === "password") {
    if (!value.length) return "请输入密码";
    if (mode === "register" && value.length < 6) return "密码至少6个字符";
    return value.length > 200 ? "密码最多200个字符" : "";
  }
  if (!value.length) return "请输入账号";
  if (mode === "login") return value.length > 64 ? "账号最多64个字符" : "";
  if (value.length < 3 || value.length > 32) return "账号需为3–32个字符";
  return /^[a-zA-Z0-9_]+$/.test(value) ? "" : "仅支持字母、数字和下划线";
}

export function validateFields(mode: AuthMode, fields: AuthFields): FieldErrors {
  const errors: FieldErrors = {};
  const names: FieldName[] = mode === "register" ? ["username", "displayName", "password"] : ["username", "password"];
  names.forEach((name) => {
    const error = validateField(mode, name, fields[name]);
    if (error) errors[name] = error;
  });
  return errors;
}

/** Subtle pointer response is isolated to the brand illustration, away from the form. */
export function initLoginMotion(root: HTMLElement): () => void {
  const visual = root.querySelector<HTMLElement>(".cm-auth-visual");
  if (!visual) return () => undefined;
  const controller = new AbortController();
  const { signal } = controller;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  let frame = 0;
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let inView = true;
  let stopped = false;
  function tick(): void {
    frame = 0;
    if (stopped || reduced.matches || document.hidden || !inView || !pointer.matches) return;
    currentX += (targetX - currentX) * 0.25;
    currentY += (targetY - currentY) * 0.25;
    visual!.style.transform = "perspective(900px) rotateX(" + (-currentY * 2.5) + "deg) rotateY(" + (currentX * 3) + "deg)";
    if (Math.abs(currentX - targetX) + Math.abs(currentY - targetY) > 0.002) schedule();
  }
  function schedule(): void {
    if (!frame && !stopped && !reduced.matches && !document.hidden && inView && pointer.matches) frame = requestAnimationFrame(tick);
  }
  function reset(): void {
    cancelAnimationFrame(frame);
    frame = 0;
    currentX = currentY = targetX = targetY = 0;
    visual!.style.transform = "none";
  }
  visual.addEventListener("pointermove", (event: PointerEvent) => {
    if (reduced.matches || !pointer.matches) return;
    const bounds = visual.getBoundingClientRect();
    targetX = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width) * 2 - 1));
    targetY = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height) * 2 - 1));
    schedule();
  }, { signal, passive: true });
  visual.addEventListener("pointerleave", () => { targetX = targetY = 0; schedule(); }, { signal });
  document.addEventListener("visibilitychange", () => { if (document.hidden) reset(); }, { signal });
  reduced.addEventListener("change", reset, { signal });
  pointer.addEventListener("change", reset, { signal });
  const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
    inView = entries[0]?.isIntersecting ?? false;
    if (!inView) reset();
  });
  observer?.observe(visual);
  return () => { stopped = true; controller.abort(); observer?.disconnect(); reset(); };
}
