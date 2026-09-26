"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ChevronDown, Eye, EyeOff, TriangleAlert, Check } from "lucide-react";
import "./login-layout.css";
import styles from "./login-form.module.css";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, FIELD_LABELS, validateField, validateFields, initLoginMotion, type AuthMode, type AuthFields, type FieldErrors, type FieldName } from "./login-motion";

/** Native login and registration surface for the existing CareerMate auth APIs. */
export function LoginForm() {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (root) return initLoginMotion(root);
  }, []);
  return (
    <div ref={rootRef} className={[styles.loginPage, "cm-auth"].join(" ")}>
      <header className="cm-auth-header od-row">
        <Link className="cm-auth-brand od-row" href="/" aria-label="CareerMate 首页"><span className="cm-auth-brand-mark"><svg className="cm-auth-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M3 11a20 20 0 0 0 18 0M12 11v4"/></svg></span><span>CareerMate<span className="cm-auth-brand-dot">.</span></span></Link>
        <Link className="cm-auth-back od-row" href="/"><svg className="cm-auth-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12H4M11 5l-7 7 7 7"/></svg><span>返回首页</span></Link>
      </header>
      <main className="cm-auth-main">
        <section className="cm-auth-intro" aria-label="CareerMate 职业成长伙伴">
          <div className="cm-auth-eyebrow od-row"><span className="cm-auth-signal" aria-hidden="true"></span><span>AI 职业成长伙伴</span></div>
          <p className="cm-auth-brand-title">下一程，<br /><span>从了解自己开始。</span></p>
          <p className="cm-auth-brand-description">聊聊你的经历，理清你的方向。<br />让每一次学习和练习，都成为成长的下一步。</p>
          <figure className="cm-auth-visual" aria-label="从认识自己到形成计划，再到持续成长的路径示意">
            <svg className="cm-auth-path" viewBox="0 0 520 240" width="520" height="240" fill="none" aria-hidden="true">
              <ellipse className="cm-auth-path-ground" cx="262" cy="183" rx="230" ry="33" />
              <path className="cm-auth-path-back" d="M40 176C92 176 126 107 189 107S273 159 330 118 405 62 484 62" />
              <path className="cm-auth-path-guide" d="M40 176C123 176 139 209 236 185S364 146 484 62" />
              <path className="cm-auth-path-guide" d="M40 176C112 118 127 57 218 66S365 20 484 62" />
              <path className="cm-auth-path-main" d="M40 176C118 176 159 138 236 133S356 64 484 62" />
              <g className="cm-auth-path-node cm-auth-path-node-one"><circle cx="40" cy="176" r="17"/><circle className="cm-auth-path-dot" cx="40" cy="176" r="5"/></g>
              <g className="cm-auth-path-node cm-auth-path-node-two"><circle cx="236" cy="133" r="24"/><path d="m227 134 6 6 12-14"/></g>
              <g className="cm-auth-path-node cm-auth-path-node-three"><circle cx="484" cy="62" r="17"/><path d="M478 68l12-12M478 56h12v12"/></g>
              <circle className="cm-auth-path-small" cx="125" cy="164" r="3"/>
              <circle className="cm-auth-path-small" cx="352" cy="87" r="3"/>
            </svg>
            <figcaption className="cm-auth-path-captions"><span className="od-stat"><span className="cm-auth-step-no">01</span><span>认识自己</span></span><span className="od-stat"><span className="cm-auth-step-no">02</span><span>形成计划</span></span><span className="od-stat"><span className="cm-auth-step-no">03</span><span>持续成长</span></span></figcaption>
          </figure>
          <div className="cm-auth-intro-note od-row"><svg className="cm-auth-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z"/></svg><span>你的下一步，由你决定。</span></div>
        </section>
        <section className="cm-auth-panel" aria-labelledby="cm-auth-title"><AuthPanel /></section>
      </main>
      <footer className="cm-auth-footer od-row"><span>© 2026 CareerMate</span><span>陪你探索方向，也陪你走好每一步。</span></footer>

    </div>
  );
}

function AuthPanel() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [fields, setFields] = useState<AuthFields>({ username: "", displayName: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoMessage, setDemoMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "pending" | "success">("idle");
  const [focusVersion, setFocusVersion] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);
  const busy = status !== "idle";
  const errorNames = (Object.keys(errors) as FieldName[]).filter(name => errors[name]);

  useEffect(() => { if (focusVersion) summaryRef.current?.focus(); }, [focusVersion]);
  useEffect(() => () => { requestRef.current?.abort(); }, []);

  function changeMode(next: AuthMode) {
    if (busy || pendingRef.current || mode === next) return;
    setMode(next);
    setErrors({});
    setServerError("");
    setShowSummary(false);
    setShowPassword(false);
    setDemoMessage("");
  }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (busy || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next: AuthMode = event.key === "Home" ? "login" : event.key === "End" ? "register" : mode === "login" ? "register" : "login";
    changeMode(next);
    panelRef.current?.querySelector<HTMLButtonElement>('[data-auth-mode="' + next + '"]')?.focus();
  }
  function changeField(name: FieldName, value: string) {
    setFields(previous => ({ ...previous, [name]: value }));
    setErrors(previous => { const next = { ...previous }; delete next[name]; return next; });
    setServerError("");
    setDemoMessage("");
  }
  function blurField(name: FieldName) {
    const error = validateField(mode, name, fields[name]);
    setErrors(previous => { const next = { ...previous }; if (error) next[name] = error; else delete next[name]; return next; });
  }
  function fillDemo(account: typeof DEMO_ACCOUNTS[number]) {
    if (busy) return;
    setFields(previous => ({ ...previous, username: account.username, password: DEMO_PASSWORD, displayName: mode === "register" ? account.username : previous.displayName }));
    setErrors({});
    setServerError("");
    setShowSummary(false);
    setShowPassword(false);
    setDemoMessage("已填入" + account.label + "，请确认后提交。");
  }
  function focusField(event: MouseEvent<HTMLAnchorElement>, name: FieldName) {
    event.preventDefault();
    panelRef.current?.querySelector<HTMLInputElement>('#cm-auth-' + name)?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current || busy) return;
    const nextErrors = validateFields(mode, fields);
    setErrors(nextErrors);
    setServerError("");
    setShowSummary(true);
    if (Object.keys(nextErrors).length) { setFocusVersion(value => value + 1); return; }
    pendingRef.current = true;
    setStatus("pending");
    const controller = new AbortController();
    requestRef.current = controller;
    let succeeded = false;
    const unavailable = mode === "login" ? "登录服务暂时不可用，请稍后重试" : "注册服务暂时不可用，请稍后重试";
    try {
      const response = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        signal: controller.signal,
        body: JSON.stringify(mode === "login" ? { username: fields.username, password: fields.password } : { username: fields.username, displayName: fields.displayName, password: fields.password }),
      });
      const rawPayload = await response.text();
      if (!rawPayload) throw new Error(unavailable);
      let parsed: unknown;
      try { parsed = JSON.parse(rawPayload); } catch { throw new Error(unavailable); }
      if (!parsed || typeof parsed !== "object" || !("ok" in parsed)) throw new Error(unavailable);
      const payload = parsed as { ok?: boolean; data?: { nextPath?: unknown }; error?: { message?: unknown } };
      if (!response.ok || payload.ok !== true) {
        const message = typeof payload.error?.message === "string" ? payload.error.message : unavailable;
        throw new Error(message);
      }
      if (controller.signal.aborted) return;
      setStatus("success");
      const nextPath = typeof payload.data?.nextPath === "string" && payload.data.nextPath ? payload.data.nextPath : mode === "register" ? "/onboarding" : "/";
      router.push(nextPath);
      router.refresh();
      succeeded = true;
    } catch (error) {
      if (controller.signal.aborted) return;
      setServerError(error instanceof Error && !(error instanceof TypeError) ? error.message : unavailable);
      setFocusVersion(value => value + 1);
    } finally {
      pendingRef.current = false;
      requestRef.current = null;
      if (!succeeded && !controller.signal.aborted) setStatus("idle");
    }
  }

  return (
    <div className="cm-auth-content" data-state={status} ref={panelRef}>
      <h1 className="cm-auth-title" id="cm-auth-title">{mode === "login" ? "欢迎回来。" : "开启你的下一程。"}</h1>
      <p className="cm-auth-subtitle">{mode === "login" ? "登录，继续你的成长旅程。" : "创建账号，从认识自己开始。"}</p>
      <div className="cm-auth-tabs" role="tablist" aria-label="登录或注册">
        <button type="button" className="cm-auth-tab" id="cm-auth-tab-login" data-auth-mode="login" role="tab" aria-selected={mode === "login"} aria-controls="cm-auth-tabpanel" tabIndex={mode === "login" ? 0 : -1} disabled={busy} onClick={() => changeMode("login")} onKeyDown={tabKey}>登录</button>
        <button type="button" className="cm-auth-tab" id="cm-auth-tab-register" data-auth-mode="register" role="tab" aria-selected={mode === "register"} aria-controls="cm-auth-tabpanel" tabIndex={mode === "register" ? 0 : -1} disabled={busy} onClick={() => changeMode("register")} onKeyDown={tabKey}>注册</button>
      </div>
      <div id="cm-auth-tabpanel" role="tabpanel" aria-labelledby={"cm-auth-tab-" + mode}>
        <form className="cm-auth-form" method="post" action={mode === "login" ? "/api/auth/login" : "/api/auth/register"} onSubmit={submit} noValidate aria-busy={status === "pending"}>
          {(serverError || (showSummary && errorNames.length > 0)) && (
            <div className="cm-auth-error-summary" ref={summaryRef} role="alert" tabIndex={-1}>
              <p>{serverError || "请检查以下输入"}</p>
              {errorNames.length > 0 && <ul>{errorNames.map(name => <li key={name}><a href={"#cm-auth-" + name} onClick={event => focusField(event, name)}>{FIELD_LABELS[name]}：{errors[name]}</a></li>)}</ul>}
            </div>
          )}
          <div className="cm-auth-fields">
            <div className="cm-auth-field od-field">
              <label className="cm-auth-label" htmlFor="cm-auth-username">账号<span className="cm-auth-required" aria-hidden="true">*</span></label>
              <input className={"cm-auth-input" + (errors.username ? " is-invalid" : "")} id="cm-auth-username" name="username" type="text" required autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={mode === "register" ? 32 : 64} value={fields.username} onChange={event => changeField("username", event.target.value)} onBlur={() => blurField("username")} placeholder={mode === "register" ? "设置你的账号" : "请输入账号"} disabled={busy} aria-invalid={!!errors.username} aria-describedby={[mode === "register" ? "cm-auth-username-hint" : "", errors.username ? "cm-auth-username-error" : ""].filter(Boolean).join(" ") || undefined} />
              {mode === "register" && <p className="cm-auth-hint" id="cm-auth-username-hint">3–32位字母、数字或下划线</p>}
              {errors.username && <p className="cm-auth-field-error" id="cm-auth-username-error"><TriangleAlert className="cm-auth-icon" aria-hidden="true"/><span>{errors.username}</span></p>}
            </div>
            {mode === "register" && <div className="cm-auth-field cm-auth-nickname od-field">
              <label className="cm-auth-label" htmlFor="cm-auth-displayName">昵称<span className="cm-auth-required" aria-hidden="true">*</span></label>
              <input className={"cm-auth-input" + (errors.displayName ? " is-invalid" : "")} id="cm-auth-displayName" name="displayName" type="text" required autoComplete="name" maxLength={32} value={fields.displayName} onChange={event => changeField("displayName", event.target.value)} onBlur={() => blurField("displayName")} placeholder="我们该怎么称呼你" disabled={busy} aria-invalid={!!errors.displayName} aria-describedby={errors.displayName ? "cm-auth-displayName-error" : undefined} />
              {errors.displayName && <p className="cm-auth-field-error" id="cm-auth-displayName-error"><TriangleAlert className="cm-auth-icon" aria-hidden="true"/><span>{errors.displayName}</span></p>}
            </div>}
            <div className="cm-auth-field od-field">
              <label className="cm-auth-label" htmlFor="cm-auth-password">密码<span className="cm-auth-required" aria-hidden="true">*</span></label>
              <div className={"cm-auth-password" + (errors.password ? " is-invalid" : "")}>
                <input className="cm-auth-input" id="cm-auth-password" name="password" type={showPassword ? "text" : "password"} required autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 6 : 1} maxLength={200} value={fields.password} onChange={event => changeField("password", event.target.value)} onBlur={() => blurField("password")} placeholder={mode === "register" ? "设置登录密码" : "请输入密码"} disabled={busy} aria-invalid={!!errors.password} aria-describedby={[mode === "register" ? "cm-auth-password-hint" : "", errors.password ? "cm-auth-password-error" : ""].filter(Boolean).join(" ") || undefined} />
                <button className="cm-auth-eye" type="button" disabled={busy} onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "隐藏口令" : "显示口令"} aria-pressed={showPassword}>{showPassword ? <EyeOff className="cm-auth-icon" aria-hidden="true"/> : <Eye className="cm-auth-icon" aria-hidden="true"/>}</button>
              </div>
              {mode === "register" && <p className="cm-auth-hint" id="cm-auth-password-hint">6–200个字符，请妥善保管</p>}
              {errors.password && <p className="cm-auth-field-error" id="cm-auth-password-error"><TriangleAlert className="cm-auth-icon" aria-hidden="true"/><span>{errors.password}</span></p>}
            </div>
          </div>
          <div className="cm-auth-submit-wrap">
            <button className="cm-auth-submit" type="submit" disabled={busy}><span>{status === "pending" ? (mode === "login" ? "正在登录…" : "正在创建账号…") : status === "success" ? "正在跳转…" : mode === "login" ? "进入 CareerMate" : "创建账号"}</span>{status === "success" ? <Check className="cm-auth-icon" aria-hidden="true"/> : <ArrowRight className="cm-auth-icon" aria-hidden="true"/>}</button>
            <div className="cm-auth-progress" role="progressbar" aria-label={mode === "login" ? "正在登录" : "正在注册"} aria-hidden={status !== "pending"}><span/></div>
          </div>
        </form>
        <span className="cm-auth-sr" role="status" aria-live="polite">{status === "pending" ? "正在提交，请稍候。" : ""}</span>
        {status === "success" && <div className="cm-auth-result" role="status"><p>{mode === "login" ? "登录成功，正在跳转。" : "账号已创建，正在跳转。"}</p></div>}
      </div>
      <div className="cm-auth-demo">
        <button className="cm-auth-demo-toggle" type="button" disabled={busy} aria-expanded={demoOpen} aria-controls="cm-auth-demo-accounts" onClick={() => setDemoOpen(value => !value)}><span>使用演示账号</span><ChevronDown className="cm-auth-icon" aria-hidden="true"/></button>
        <div className="cm-auth-demo-content" id="cm-auth-demo-accounts" hidden={!demoOpen}>
          <p className="cm-auth-demo-description">选择账号自动填入，确认后再提交。<br/>账号需已存在于当前项目中。</p>
          <div className="cm-auth-demo-grid">{DEMO_ACCOUNTS.map(account => <button className="cm-auth-demo-account" type="button" key={account.username} disabled={busy} onClick={() => fillDemo(account)}>{account.label}</button>)}</div>
          <p className="cm-auth-demo-status" role="status" aria-live="polite">{demoMessage}</p>
        </div>
      </div>
    </div>
  );
}
